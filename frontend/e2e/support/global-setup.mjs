import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM dünyasında __dirname alternatifi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load .env file and merge with process.env
 * Simple .env parser (no external dependencies)
 */
function loadEnvFile(envPath) {
  try {
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars = {};
    
    envContent.split('\n').forEach((line) => {
      // Skip comments and empty lines
      line = line.trim();
      if (!line || line.startsWith('#')) {
        return;
      }
      
      // Parse KEY=VALUE format
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        envVars[key] = value;
      }
    });
    
    return envVars;
  } catch {
    // .env file doesn't exist or can't be read - that's OK
    return {};
  }
}

/**
 * Global setup function that runs before all E2E tests
 * Seeds the test user in the database using the backend seed script
 */
async function globalSetup() {
  console.log('\n🌱 Seeding test user via Backend...');
  
  try {
    // Backend dizinini tam yol olarak belirleyelim
    const backendPath = path.resolve(__dirname, '../../../backend');
    const envPath = path.join(backendPath, '.env');
    
    console.log(`📂 Backend directory: ${backendPath}`);
    
    // Load .env file from backend directory
    const envVars = loadEnvFile(envPath);
    const mergedEnv = { ...process.env, ...envVars };
    
    if (Object.keys(envVars).length > 0) {
      console.log(`📝 Loaded ${Object.keys(envVars).length} environment variables from .env`);
    }
    
    // Seed scriptini çalıştır
    // stdout ve stderr'i yakalayıp kontrol edelim
    let stdout = '';
    let stderr = '';
    
    try {
      stdout = execSync('python3 seed_test_user.py', { 
        cwd: backendPath,
        encoding: 'utf-8',
        env: mergedEnv
      });
      
      // Success - check if user already exists message
      if (stdout.includes('already exists') || stdout.includes('Test user already exists')) {
        console.log('✅ Test user already exists in database.\n');
      } else {
        console.log('✅ Test user seeded successfully.\n');
      }
    } catch (execError) {
      // execSync throws an error, but we need to check stdout/stderr
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      
      // Check if error is just "user already exists" - that's OK
      const output = (stdout + stderr).toLowerCase();
      if (output.includes('already exists') || 
          output.includes('test user already exists') ||
          output.includes('user already exists')) {
        console.log('✅ Test user already exists in database.\n');
        return; // Success - user exists, continue silently
      }
      
      // Check if it's a Supabase config error - that's also OK (Docker will handle it)
      if (output.includes('supabase') && (output.includes('missing') || output.includes('not configured'))) {
        console.log('⚠️  Supabase env vars not found - seed will use Docker container env vars');
        console.log('Continuing tests (user might already exist or will be created via Docker)...\n');
        return; // Continue silently
      }
      
      // Other errors - log but continue
      console.warn('⚠️  Seed script warning:', execError.message);
      console.log('Continuing tests (user might already exist)...\n');
    }
  } catch (error) {
    // Unexpected error - log but don't fail tests
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('⚠️  Unexpected error during seed:', errorMessage);
    console.log('Continuing tests (user might already exist)...\n');
  }
}

export default globalSetup;
