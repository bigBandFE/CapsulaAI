// MOCKED EMBEDDING SERVICE FOR TESTING WITHOUT OLLAMA
export const generateEmbedding = async (text: string): Promise<number[]> => {
  console.log('[Embedding] Mocking vector generation for testing...');
  // Return a 1536-dim array (standard OpenAI/Pgvector size) filled with random numbers
  return Array.from({ length: 1536 }, () => Math.random());
};
