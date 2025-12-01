# Debug Session in Browser Console

Run this in the browser console to find your session:

```javascript
// List all localStorage keys
console.log("All localStorage keys:", Object.keys(localStorage));

// Find Supabase-related keys
const supabaseKeys = Object.keys(localStorage).filter(key => 
  key.includes('supabase') || key.includes('auth') || key.includes('sb-')
);
console.log("Supabase keys:", supabaseKeys);

// Try to get session from each key
supabaseKeys.forEach(key => {
  try {
    const data = localStorage.getItem(key);
    const parsed = JSON.parse(data);
    if (parsed?.currentSession || parsed?.session || parsed?.access_token) {
      console.log(`Found session in key: ${key}`, parsed);
    }
  } catch (e) {
    // Not JSON, skip
  }
});

// Alternative: Check if window.supabase is available after page reload
if (window.supabase) {
  window.supabase.auth.getSession().then(({ data, error }) => {
    console.log("Session from window.supabase:", data?.session);
    console.log("Error:", error);
  });
}
```

