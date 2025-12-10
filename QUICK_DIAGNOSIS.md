# Quick Diagnosis - Run These One at a Time

## Step 1: Check if Supabase is available
```javascript
console.log('Supabase client:', window.supabase ? '✅ Found' : '❌ Missing');
```

## Step 2: Check environment
```javascript
console.log('URL:', window.env?.VITE_SUPABASE_URL);
console.log('Key:', window.env?.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Set' : 'Missing');
```

## Step 3: Check session (synchronous check)
```javascript
window.supabase.auth.getSession().then(({data, error}) => {
  console.log('Session check:', data.session ? '✅ Has session' : '❌ No session');
  console.log('User ID:', data.session?.user?.id);
  console.log('Error:', error);
});
```

## Step 4: Simple count query
```javascript
window.supabase.from('processing_jobs').select('*', {count: 'exact', head: true}).then(({count, error}) => {
  console.log('Count:', count);
  console.log('Error:', error);
});
```

## Step 5: Test with explicit timeout
```javascript
const timeout = setTimeout(() => {
  console.log('❌ Query timed out after 3 seconds');
}, 3000);

window.supabase
  .from('processing_jobs')
  .select('id')
  .limit(1)
  .then(({data, error}) => {
    clearTimeout(timeout);
    console.log('✅ Query completed');
    console.log('Data:', data);
    console.log('Error:', error);
  })
  .catch((err) => {
    clearTimeout(timeout);
    console.error('❌ Exception:', err);
  });
```

