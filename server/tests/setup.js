// Ensure JWT_SECRET is always set before any module initialises
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-key';
