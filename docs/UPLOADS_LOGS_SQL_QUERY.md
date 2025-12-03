# SQL Query to Find Uploads Function Logs

## Corrected Query (Works in Supabase SQL Editor)

```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from edge_logs
where 
  event_message like '%Uploads Edge Function%'
  or event_message like '%uploads%'
  or event_message like '%registerUploadJob%'
order by timestamp desc
limit 50
```

## Alternative: Filter by Time Range

If you know the approximate time of your upload:

```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from edge_logs
where 
  cast(timestamp as datetime) >= '2025-12-02 22:39:00'
  and cast(timestamp as datetime) <= '2025-12-02 22:40:00'
  and (
    event_message like '%Uploads Edge Function%'
    or event_message like '%uploads%'
  )
order by timestamp desc
```

## Even Simpler: Just Search for "Upload"

```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from edge_logs
where 
  event_message like '%Upload%'
order by timestamp desc
limit 50
```

## Note

The `->` and `->>` operators are PostgreSQL JSON operators that may not work in Supabase's SQL query interface. Use `LIKE` pattern matching instead.

