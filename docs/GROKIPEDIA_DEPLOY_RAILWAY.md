# Deploy Grokipedia MCP to Railway (Easiest Option)

## Why Railway?
- ✅ Free tier available
- ✅ Automatic public HTTPS URL
- ✅ No tunneling needed
- ✅ Easy setup

## Steps

1. **Go to Railway**: https://railway.app
2. **Sign up/Login** (can use GitHub)
3. **New Project** → **Deploy from GitHub repo**
4. **Create a new repo** or use existing one with this structure:

### Create `grokipedia-server/` folder:

**`grokipedia-server/requirements.txt`**:
```
grokipedia-mcp==0.2.2
```

**`grokipedia-server/main.py`**:
```python
import subprocess
import os

if __name__ == "__main__":
    port = os.environ.get("PORT", "8888")
    subprocess.run([
        "python", "-m", "grokipedia_mcp",
        "--transport", "sse",
        "--port", port
    ])
```

**`grokipedia-server/Procfile`** (for Railway):
```
web: python main.py
```

5. **Push to GitHub** and connect to Railway
6. **Railway will auto-detect Python** and deploy
7. **Copy the public URL** (e.g., `https://grokipedia-mcp.railway.app`)
8. **Register in SlashMCP**:
   ```
   /slashmcp add grokipedia-mcp https://grokipedia-mcp.railway.app
   ```

## Alternative: Manual ngrok Setup

1. **Download ngrok**: https://ngrok.com/download
2. **Extract** `ngrok.exe` to a folder
3. **Run from that folder**:
   ```powershell
   .\ngrok.exe http 8889
   ```
4. **Copy the HTTPS URL** from ngrok output
5. **Register in SlashMCP**:
   ```
   /slashmcp add grokipedia-mcp https://abc123.ngrok.io
   ```

