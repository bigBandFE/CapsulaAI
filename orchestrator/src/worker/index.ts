
import { PrismaClient, CapsuleStatus } from '@prisma/client';
import { ModelAdapter, LLMConfig, CapabilityTester, ModelCapability, PromptEngine } from '../ai';
import { generateEmbedding } from '../services/embedding';
import { Sanitizer } from '../services/sanitizer';
import { VisionService } from '../services/vision';
import { DeduplicationService } from '../services/deduplication';

const prisma = new PrismaClient();

// Configuration for the worker (could be passed in or loaded from env)
// Configuration for the worker
const localConfig: LLMConfig = {
  endpoint: process.env.LOCAL_MODEL_ENDPOINT || 'http://host.docker.internal:11434/v1',
  modelName: process.env.LOCAL_MODEL_NAME || 'qwen2.5:7b',
  apiKey: process.env.LOCAL_API_KEY
};

const cloudConfig: LLMConfig = {
  endpoint: process.env.CLOUD_MODEL_ENDPOINT || '',
  modelName: process.env.CLOUD_MODEL_NAME || '',
  apiKey: process.env.CLOUD_API_KEY
};

const localAdapter = new ModelAdapter(localConfig);
const cloudAdapter = new ModelAdapter(cloudConfig);

let localCapability = ModelCapability.BASIC;
let cloudCapability = ModelCapability.UNUSABLE;

export const startWorker = async () => {
  console.log('Worker started. Initializing AI capabilities...');

  // Configure Vision Strategy (Specific Vision Model for OCR)
  // Use dedicated Vision Model config if available, otherwise inherit from Local config
  const visionConfig: LLMConfig = {
    endpoint: process.env.LOCAL_VISION_MODEL_ENDPOINT || localConfig.endpoint,
    modelName: process.env.LOCAL_VISION_MODEL_NAME || localConfig.modelName,
    apiKey: process.env.LOCAL_VISION_API_KEY || localConfig.apiKey
  };

  // Configure Vision Strategy
  // Dynamic switching via Env Var
  const strategy = (process.env.VISION_STRATEGY as 'TESSERACT' | 'LLM') || 'TESSERACT';
  console.log(`[Worker] Vision Strategy configured to: ${strategy}`);

  VisionService.configure(strategy, strategy === 'LLM' ? visionConfig : undefined);

  // Check Local
  try {
    localCapability = await new CapabilityTester(localConfig).runTests();
    console.log(`[Local] Capability: ${localCapability}`);
  } catch (e) {
    console.warn(`[Local] Check Failed: ${e}. Defaulting to BASIC.`); // Should ideally mark usable=false
  }

  // Check Cloud (if configured)
  if (cloudConfig.apiKey) {
    try {
      cloudCapability = await new CapabilityTester(cloudConfig).runTests();
      console.log(`[Cloud] Capability: ${cloudCapability}`);
    } catch (e) {
      console.warn(`[Cloud] Check Failed: ${e}`);
    }
  }

  poll();
};

const poll = async () => {
  try {
    const capsule = await prisma.capsule.findFirst({
      where: { status: CapsuleStatus.PENDING },
      orderBy: { createdAt: 'asc' }
    });

    if (capsule) {
      console.log(`Processing Capsule: ${capsule.id}`);
      await processCapsule(capsule.id);
    }
  } catch (error) {
    console.error('Worker polling error:', error);
  } finally {
    setTimeout(poll, 5000); // 5s Interval
  }
};

const processCapsule = async (capsuleId: string) => {
  try {
    await prisma.capsule.update({
      where: { id: capsuleId },
      data: { status: CapsuleStatus.PROCESSING }
    });

    const capsule = await prisma.capsule.findUnique({ where: { id: capsuleId } });
    if (!capsule) throw new Error('Capsule content missing');

    // 0. Vision/OCR Pipeline (if applicable)
    // If source is IMAGE or PDF (future), extract text first.
    if ((capsule.sourceType === 'IMAGE' || capsule.sourceType === 'PDF') && !capsule.originalContent) {
      console.log(`[Worker] Image/PDF detected. Running OCR...`);
      // Find the first asset (MVP)
      const asset = await prisma.asset.findFirst({ where: { capsuleId } });
      if (asset) {
        try {
          // We need to resolve the local path. For Docker, MinIO volume is mapped? 
          // actually, tesseract needs local file. 
          // For now, let's assume we can access it via the shared volume or download it.
          // SIMPLIFICATION: We will mock the OCR for now effectively because downloading from MinIO 
          // inside the container requires MinIO client.
          // Let's import the service dynamically to avoid issues if not installed
          const { VisionService } = await import('../services/vision');
          // In a real app, we'd download asset.storagePath to a temp file
          // capsule.originalContent = await VisionService.extractText(downloadedFile);

          // For prototype demonstration without heavy MinIO plumbing:
          capsule.originalContent = "[OCR] Image Content Placeholder";

          // If we had tesseract working:
          // capsule.originalContent = await VisionService.extractText(asset.storagePath);
        } catch (e) {
          console.warn(`[Worker] OCR Failed: ${e}`);
        }
      }
    }

    if (!capsule.originalContent) {
      // If still empty after OCR attempt
      throw new Error('Capsule content missing');
    }

    // 1. Sanitize (Privacy Guard) - Always do this, we need it if we fall back to cloud
    const { sanitized, map } = Sanitizer.sanitize(capsule.originalContent);
    const isSanitized = Object.keys(map).length > 0;

    // Routing Logic:
    // If Local is ADVANCED, use Local.
    // If Local is BASIC/UNUSABLE and Cloud is ADVANCED, might prefer Cloud for complex tasks.
    // For now, "Local First" means try Local first.
    // However, if we sanitize, we can safely use Cloud.

    let activeAdapter = localAdapter;
    let activeCapability = localCapability;
    let usingCloud = false;

    // Simple strategy: If Local is UNUSABLE (or failed check), try Cloud.
    // Or if user specifically requested "deep_reasoning" (future feature).
    // Here we stick to: Try Local. If Logic requires Advanced and Local is Basic, swap? 
    // Let's implement: Try Local. If it fails (exception) or returns garbage, could retry on Cloud.

    // For PRD "Cloud Assist": If we wanted to use Cloud for complex tasks, we'd check capability here.
    if (localCapability === ModelCapability.UNUSABLE && cloudCapability !== ModelCapability.UNUSABLE) {
      console.log(`[Worker] Local unusable, switching to Cloud.`);
      activeAdapter = cloudAdapter;
      activeCapability = cloudCapability;
      usingCloud = true;
    }

    // 4. Complexity Analysis (Routing)
    // Use Local Model to judge if we need Cloud aid
    let complexity = 'SIMPLE';
    try {
      const analyzePrompt = PromptEngine.getComplexityAnalysisPrompt(capsule.originalContent);
      // Quick check using Local Adapter
      const analysisRes = await localAdapter.chatCompletion([{ role: 'user', content: analyzePrompt }], true);
      const analysisJson = JSON.parse(analysisRes.content.replace(/```json|```/g, '').trim());
      complexity = analysisJson.complexity || 'SIMPLE';
      console.log(`[Worker] Task Complexity Analysis: ${complexity}`);
    } catch (e) {
      console.warn(`[Worker] Complexity Analysis failed, defaulting to SIMPLE. Error: ${e}`);
    }

    // Routing Decision:
    // If COMPLEX and Cloud is available -> Use Cloud (Enhanced)
    // If SIMPLE -> Use Local
    if (complexity === 'COMPLEX' && cloudCapability !== ModelCapability.UNUSABLE) {
      console.log(`[Worker] Routing to Cloud for COMPLEX task (Sanitized).`);
      activeAdapter = cloudAdapter;
      activeCapability = cloudCapability;
      usingCloud = true;
    }

    const contentToProcess = usingCloud ? sanitized : capsule.originalContent;
    const prompt = PromptEngine.getExtractionPrompt(contentToProcess, activeCapability);

    // 5. Execution
    let aiResponse;
    try {
      aiResponse = await activeAdapter.chatCompletion([
        { role: 'user', content: prompt }
      ], true);
    } catch (primaryError) {
      console.warn(`[Worker] Primary inference failed: ${primaryError}`);

      // Fallback Logic
      if (!usingCloud && cloudCapability !== ModelCapability.UNUSABLE) {
        console.log(`[Worker] Local failed, retrying with Cloud...`);
        const cloudPrompt = PromptEngine.getExtractionPrompt(sanitized, cloudCapability);
        aiResponse = await cloudAdapter.chatCompletion([
          { role: 'user', content: cloudPrompt }
        ], true);
        usingCloud = true;
      } else {
        throw primaryError;
      }
    }

    // 4. Parse JSON & Quality Check
    let structuredData: any = {};
    let parseSuccess = false;

    try {
      const cleanJson = aiResponse.content.replace(/```json|```/g, '').trim();
      structuredData = JSON.parse(cleanJson);
      parseSuccess = true;
    } catch (e) {
      console.warn(`[Worker] Local JSON Parse Failed: ${e}`);
    }

    // QUALITY ESCALATION:
    // If Local produced invalid JSON (garbage), and we haven't tried Cloud yet, TRY CLOUD.
    if (!parseSuccess && !usingCloud && cloudCapability !== ModelCapability.UNUSABLE) {
      console.log(`[Worker] Local output invalid. Escalating to Cloud for enhancement...`);

      try {
        const cloudPrompt = PromptEngine.getExtractionPrompt(sanitized, cloudCapability);
        const cloudResponse = await cloudAdapter.chatCompletion([
          { role: 'user', content: cloudPrompt }
        ], true);

        const cloudJson = cloudResponse.content.replace(/```json|```/g, '').trim();
        structuredData = JSON.parse(cloudJson);
        usingCloud = true; // Mark as used
        console.log(`[Worker] Cloud rescue successful.`);
      } catch (cloudErr) {
        console.error(`[Worker] Cloud escalation also failed: ${cloudErr}`);
        structuredData = { error: 'Extraction Failed (Local+Cloud)', raw: aiResponse.content };
      }
    } else if (!parseSuccess) {
      // Failed and no cloud fallback available/possible
      structuredData = { error: 'Failed to parse JSON', raw: aiResponse.content };
    }

    // 5. Restore PII (Privacy Restore)
    // Only strictly needed if we sanitized, but safe to run always
    structuredData = Sanitizer.restore(structuredData, map);

    // 6. Data Evolution: Version Tagging
    // Inject schema version so we can identify this data format later
    structuredData.schema_version = "v1.0";

    // 6. Generate Embedding (for the original content + summary)
    // We use the ORIGINAL content for embedding, as local embedding model is safe/local
    const summary = structuredData.content?.summary || capsule.originalContent.substring(0, 500);
    const embedding = await generateEmbedding(capsule.originalContent + '\n' + summary);

    // Prepare embeddings for creation
    const embeddings = [{
      vector: `[${embedding.join(',')}]`, // Convert number[] to pgvector text format
      contentChunk: summary,
      chunkIndex: 0
    }];

    // 7. Save & Complete (Atomic Transaction)
    // 7. Save & Complete (Atomic Transaction)
    await prisma.$transaction(async (tx: any) => {
      // Update Capsule Status & Data
      await tx.capsule.update({
        where: { id: capsuleId },
        data: {
          status: CapsuleStatus.COMPLETED,
          isSanitized: isSanitized,
          structuredData: structuredData as any
        }
      });

      // Insert Embedding (Vector)
      // Note: We use executeRaw because Prisma's typed client for 'Unsupported("vector")' is limited.
      const vectorStr = `[${embedding.join(',')}]`;
      const summarySafe = summary.replace(/\0/g, ''); // Remove null bytes if any

      await tx.$executeRaw`
            INSERT INTO "Embedding" ("id", "capsuleId", "vector", "contentChunk", "chunkIndex")
            VALUES (gen_random_uuid(), ${capsuleId}, ${vectorStr}::vector, ${summarySafe}, 0);
        `;
    });

    console.log(`[Worker] Capsule ${capsule.id} processed and saved.`);

    // 8. Entity Linking (Graph Population) - Phase 2
    if (structuredData && structuredData.entities && Array.isArray(structuredData.entities)) {
      console.log(`[Worker] Linking ${structuredData.entities.length} entities...`);

      for (const entity of structuredData.entities) {
        if (!entity.name || !entity.type) continue;

        const safeName = String(entity.name).trim();
        const safeType = String(entity.type).toUpperCase().trim();

        try {
          // Upsert Entity and connect to Capsule
          // We use a separate transaction or just standard Prisma call for each to ensure identifying existing entities
          // Note: Prisma's implicit m-n relations require 'connect' or 'create'.
          // Since we don't know if entity exists, we use 'upsert' pattern logic:
          // But implicit m-n doesn't support 'connectOrCreate' directly on the relation update easily without ID.
          // So we explicitly Upsert the Entity first, then Connect.

          const dbEntity = await prisma.entity.upsert({
            where: {
              name_type: {
                name: safeName,
                type: safeType
              }
            },
            update: {}, // No changes if exists
            create: {
              name: safeName,
              type: safeType
            }
          });

          // Link to Capsule
          await prisma.capsule.update({
            where: { id: capsule.id },
            data: {
              entities: {
                connect: { id: dbEntity.id }
              }
            }
          });

        } catch (err) {
          console.warn(`[Worker] Failed to link entity ${safeName}: ${err}`);
        }
      }
      console.log(`[Worker] Entity linking complete.`);
    }

    // 9. Similarity Detection (Phase 2.5)
    try {
      const similarCapsules = await DeduplicationService.findSimilarCapsules(embedding, 0.95);
      if (similarCapsules.length > 0) {
        const mostSimilar = similarCapsules[0];
        console.log(`[Worker] Found similar capsule: ${mostSimilar.id} (similarity: ${mostSimilar.score.toFixed(3)})`);
        await DeduplicationService.markAsSimilar(capsuleId, mostSimilar.id, mostSimilar.score);
      }
    } catch (err) {
      console.warn(`[Worker] Similarity detection failed: ${err}`);
    }

  } catch (error) {
    console.error(`Error processing capsule ${capsuleId}: `, error);
    await prisma.capsule.update({
      where: { id: capsuleId },
      data: { status: CapsuleStatus.FAILED }
    });
  }
};
