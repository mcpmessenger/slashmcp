-- Add file_path column to processing_jobs table
alter table processing_jobs
add column file_path text;

-- Optional: Add a policy to allow users to update their own job status/file_path
create policy "Users can update their own processing jobs"
on processing_jobs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
