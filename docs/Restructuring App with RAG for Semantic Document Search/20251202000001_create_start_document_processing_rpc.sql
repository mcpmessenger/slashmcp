-- RPC function to start document processing
create or replace function start_document_processing(
  file_path text,
  user_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  new_job_id uuid;
begin
  -- 1. Insert a new job into processing_jobs table
  insert into processing_jobs (user_id, status, file_path)
  values (user_id, 'pending', file_path)
  returning id into new_job_id;

  -- 2. Call the Edge Function asynchronously to process the document
  -- Note: This assumes the Edge Function 'process-document' is deployed
  -- and accessible via a service like a webhook or a direct call from a worker.
  -- For a simple Supabase setup, we'll assume an external trigger or a
  -- database trigger on insert that calls the function.
  -- Since direct RPC to Edge Function is not standard, we'll rely on the
  -- frontend to call the function and the function to be triggered by a worker.
  -- For this instruction set, we'll assume the frontend calls this RPC,
  -- and a separate worker/webhook listens for 'pending' jobs.
  -- However, for a self-contained example, we will simulate the trigger
  -- by providing the necessary data for the worker.

  -- For now, we just return the job ID. The actual trigger mechanism
  -- (e.g., a database trigger, a dedicated worker, or a direct call from the client)
  -- will be part of the developer instructions.

  return new_job_id;
end;
$$;

-- Grant execution to authenticated users
grant execute on function start_document_processing(text, uuid) to authenticated;
