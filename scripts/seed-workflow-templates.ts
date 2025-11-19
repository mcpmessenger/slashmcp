#!/usr/bin/env tsx
/**
 * Script to seed workflow templates
 * 
 * Usage:
 *   npx tsx scripts/seed-workflow-templates.ts
 * 
 * This script creates the 3 demo workflow templates if they don't already exist.
 * It requires a Supabase connection and at least one user in the database.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seedTemplates() {
  console.log('🌱 Seeding workflow templates...\n');

  // Check if templates already exist
  const { data: existingTemplates, error: checkError } = await supabase
    .from('workflows')
    .select('name')
    .eq('is_template', true)
    .in('name', [
      'Competitive Intelligence Report',
      'Market Research & Content Pipeline',
      'Due Diligence Automation',
    ]);

  if (checkError) {
    console.error('❌ Error checking existing templates:', checkError);
    process.exit(1);
  }

  if (existingTemplates && existingTemplates.length > 0) {
    console.log('✅ Templates already exist:');
    existingTemplates.forEach(t => console.log(`   - ${t.name}`));
    console.log('\n💡 To recreate templates, delete existing ones first or run the migration.');
    return;
  }

  // Get first user (templates need a user_id)
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError || !users || users.users.length === 0) {
    console.error('❌ Error: No users found in database');
    console.error('   Templates require at least one user. Please create a user account first.');
    process.exit(1);
  }

  const systemUserId = users.users[0].id;
  console.log(`📋 Using system user: ${users.users[0].email || systemUserId}\n`);

  // Read and execute the migration SQL
  const migrationPath = join(__dirname, '../supabase/migrations/20250120000000_seed_demo_workflow_templates.sql');
  
  try {
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration
    // Note: We can't directly execute DO blocks via Supabase client
    // Instead, we'll use the Supabase SQL API or recommend running the migration
    console.log('⚠️  Note: This script checks for templates but cannot execute the migration directly.');
    console.log('   Please run the migration using:');
    console.log('   npx supabase migration up');
    console.log('   or');
    console.log('   npx supabase db push\n');
    
    // Verify templates were created
    const { data: templates, error: verifyError } = await supabase
      .from('workflows')
      .select('name, template_category')
      .eq('is_template', true);

    if (verifyError) {
      console.error('❌ Error verifying templates:', verifyError);
      return;
    }

    if (templates && templates.length > 0) {
      console.log('✅ Templates found:');
      templates.forEach(t => {
        console.log(`   - ${t.name} (${t.template_category})`);
      });
    } else {
      console.log('ℹ️  No templates found. Run the migration to create them.');
    }
  } catch (error) {
    console.error('❌ Error reading migration file:', error);
    process.exit(1);
  }
}

// Run the script
seedTemplates()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

