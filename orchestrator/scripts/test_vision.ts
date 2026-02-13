import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  endpoint: process.env.LOCAL_VISION_MODEL_ENDPOINT || 'https://api.moonshot.cn/v1',
  modelName: process.env.LOCAL_VISION_MODEL_NAME || 'kimi-2.5-latest',
  apiKey: process.env.LOCAL_VISION_API_KEY
};

console.log('--- VLM Test Config ---');
console.log('Endpoint:', config.endpoint);
console.log('Model:', config.modelName);
console.log('API Key:', config.apiKey ? (config.apiKey.substring(0, 8) + '...' + config.apiKey.substring(config.apiKey.length - 4)) : 'MISSING');

const client = new OpenAI({
  baseURL: config.endpoint,
  apiKey: config.apiKey,
});

async function testVLM() {
  try {
    console.log('\nSending test request (text-only)...');
    const response = await client.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'user', content: 'Hello, are you working?' }
      ]
    });
    console.log('Success!', response.choices[0].message.content);
  } catch (error: any) {
    console.error('FAILED:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testVLM();
