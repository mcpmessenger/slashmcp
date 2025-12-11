import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-core';
import { install, getInstalledBrowsers, canDownload } from '@puppeteer/browsers';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-browser-auth']
}));

app.use(express.json());

// Browser instance management (reuse browser for performance)
let browser = null;

async function getBrowser() {
  if (!browser) {
    console.log('Launching browser...');
    
    let executablePath = process.env.CHROMIUM_PATH || 
                        process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      // Check if Chromium is already installed
      const cacheDir = process.env.HOME || '/tmp/.puppeteer';
      const installedBrowsers = await getInstalledBrowsers({ cacheDir });
      const chromium = installedBrowsers.find(b => b.browser === 'chromium');
      
      if (chromium) {
        executablePath = chromium.executablePath;
        console.log(`Using cached Chromium: ${executablePath}`);
      } else {
        // Download Chromium
        console.log('Downloading Chromium (this may take 2-3 minutes on first run)...');
        try {
          const result = await install({
            browser: 'chromium',
            buildId: 'latest',
            cacheDir: cacheDir
          });
          executablePath = result.executablePath;
          console.log(`Chromium downloaded to: ${executablePath}`);
        } catch (error) {
          console.error('Failed to download Chromium:', error);
          // Fallback to channel option
          browser = await puppeteer.launch({
            channel: 'chrome',
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
              '--window-size=1920x1080'
            ],
            timeout: 120000 // 2 minutes for download
          });
          console.log('Browser launched with channel option (fallback)');
          return browser;
        }
      }
    }
    
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ],
      timeout: 120000
    });
    console.log('Browser launched successfully');
  }
  return browser;
}

// Health check (also keeps service awake on free tier)
app.get('/health', async (req, res) => {
  try {
    // Try to get browser to ensure it's ready
    const browserInstance = await getBrowser();
    res.json({ 
      status: 'ok', 
      service: 'browser-automation',
      browserReady: !!browserInstance
    });
  } catch (error) {
    res.json({ 
      status: 'ok', 
      service: 'browser-automation',
      browserReady: false,
      message: error.message
    });
  }
});

// Main invoke endpoint (MCP gateway format)
app.post('/invoke', async (req, res) => {
  let page = null;
  try {
    // Optional bearer token auth
    const expectedToken = process.env.BROWSER_AUTH_TOKEN;
    if (expectedToken) {
      const headerToken = req.headers['x-browser-auth'] || req.headers['authorization'] || '';
      const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
      const cleaned = token.replace(/^Bearer\s+/i, '').trim();
      if (cleaned !== expectedToken) {
        return res.status(401).json({
          result: { type: 'error', message: 'Unauthorized: invalid token' }
        });
      }
    }

    const { command, args = {}, positionalArgs = [] } = req.body;
    
    if (!command) {
      return res.status(400).json({
        result: {
          type: 'error',
          message: 'Missing required parameter: command'
        }
      });
    }

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let result;

    switch (command) {
      case 'browser_navigate': {
        const url = args.url || positionalArgs[0];
        if (!url) {
          result = {
            type: 'error',
            message: 'Missing required parameter: url'
          };
          break;
        }

        try {
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });

          const title = await page.title();
          const url_final = page.url();

          result = {
            type: 'json',
            data: {
              url: url_final,
              title,
              status: 200,
              message: 'Page loaded successfully'
            },
            summary: `Navigated to ${url_final} - ${title}`
          };
        } catch (error) {
          result = {
            type: 'error',
            message: `Navigation failed: ${error.message}`
          };
        }
        break;
      }

      case 'browser_snapshot': {
        const url = args.url || positionalArgs[0];
        
        if (url) {
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 30000 
            });
          } catch (error) {
            result = {
              type: 'error',
              message: `Navigation failed: ${error.message}`
            };
            break;
          }
        }

        // Get accessibility snapshot
        const snapshot = await page.evaluate(() => {
          const elements = [];
          
          // Get all interactive and visible elements
          const selectors = [
            'a[href]',
            'button',
            'input',
            'select',
            'textarea',
            '[role="button"]',
            '[role="link"]',
            'h1, h2, h3, h4, h5, h6',
            '[data-testid]',
            '[id]'
          ];

          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((el, index) => {
              if (el.offsetParent !== null) { // Only visible elements
                const rect = el.getBoundingClientRect();
                const text = el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('alt') || '';
                
                if (text || el.id || el.getAttribute('data-testid')) {
                  elements.push({
                    role: el.getAttribute('role') || el.tagName.toLowerCase(),
                    name: text || el.id || el.getAttribute('data-testid') || `Element ${index}`,
                    ref: el.id ? `#${el.id}` : el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
                    type: el.tagName.toLowerCase(),
                    href: el.href || null,
                    visible: true,
                    bounds: {
                      x: Math.round(rect.x),
                      y: Math.round(rect.y),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height)
                    }
                  });
                }
              }
            });
          });

          return {
            title: document.title,
            url: window.location.href,
            elements: elements.slice(0, 100) // Limit to 100 elements
          };
        });

        result = {
          type: 'json',
          data: snapshot,
          summary: `Page snapshot: ${snapshot.title} (${snapshot.elements.length} elements)`
        };
        break;
      }

      case 'browser_click': {
        const element = args.element || positionalArgs[0];
        const ref = args.ref || positionalArgs[1];
        const url = args.url || positionalArgs[2];

        if (!ref) {
          result = {
            type: 'error',
            message: 'Missing required parameter: ref'
          };
          break;
        }

        if (url) {
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 30000 
            });
          } catch (error) {
            result = {
              type: 'error',
              message: `Navigation failed: ${error.message}`
            };
            break;
          }
        }

        try {
          // Wait for element and click
          await page.waitForSelector(ref, { timeout: 5000 });
          await page.click(ref);
          
          // Wait for navigation or changes
          await page.waitForTimeout(1000);

          const newUrl = page.url();
          const title = await page.title();

          result = {
            type: 'json',
            data: {
              action: 'clicked',
              element,
              ref,
              navigatedTo: newUrl,
              title,
              message: `Clicked ${element || ref}`
            },
            summary: `Clicked ${element || ref} → ${newUrl}`
          };
        } catch (error) {
          result = {
            type: 'error',
            message: `Click failed: ${error.message}. Element "${ref}" not found or not clickable.`
          };
        }
        break;
      }

      case 'browser_take_screenshot': {
        const url = args.url || positionalArgs[0];
        const filename = args.filename || `screenshot-${Date.now()}.png`;

        if (url) {
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 30000 
            });
          } catch (error) {
            result = {
              type: 'error',
              message: `Navigation failed: ${error.message}`
            };
            break;
          }
        }

        try {
          const screenshot = await page.screenshot({
            type: 'png',
            fullPage: args.fullPage === 'true' || args.fullPage === true
          });

          const base64 = screenshot.toString('base64');
          const dataUrl = `data:image/png;base64,${base64}`;

          result = {
            type: 'json',
            data: {
              filename,
              url: page.url(),
              title: await page.title(),
              screenshot: dataUrl,
              message: 'Screenshot captured successfully'
            },
            summary: `Screenshot: ${filename}`
          };
        } catch (error) {
          result = {
            type: 'error',
            message: `Screenshot failed: ${error.message}`
          };
        }
        break;
      }

      case 'browser_extract_text': {
        const url = args.url || positionalArgs[0];
        
        if (url) {
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle2',
              timeout: 30000 
            });
          } catch (error) {
            result = {
              type: 'error',
              message: `Navigation failed: ${error.message}`
            };
            break;
          }
        }

        const textContent = await page.evaluate(() => {
          // Remove script and style elements
          const scripts = document.querySelectorAll('script, style');
          scripts.forEach(el => el.remove());

          // Get main content
          const main = document.querySelector('main') || document.body;
          return main.innerText || main.textContent || '';
        });

        result = {
          type: 'text',
          content: textContent.trim().slice(0, 50000) // Limit to 50k chars
        };
        break;
      }

      default:
        result = {
          type: 'error',
          message: `Unsupported command: ${command}. Supported: browser_navigate, browser_snapshot, browser_click, browser_take_screenshot, browser_extract_text`
        };
    }

    res.json({ result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Browser service error:', error);
    res.status(500).json({
      result: {
        type: 'error',
        message: error.message || 'Unknown error occurred'
      }
    });
  } finally {
    if (page) {
      await page.close();
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Browser automation service running on port ${PORT}`);
});

