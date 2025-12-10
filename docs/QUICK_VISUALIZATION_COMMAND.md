# Quick Command: Visualize Your Headphone Price Data

## One-Command Solution

Copy and paste this command to process your scraped data and create visualizations:

```
/gemini-mcp generate_text prompt="Process this headphone price comparison data and create:

1. A formatted markdown summary table with columns: Product Name, Craigslist Price, OfferUp Price, eBay Avg Price, Best Deal, Savings

2. A Mermaid bar chart comparing prices across platforms

3. Best deal recommendations

DATA FROM SCRAPING:
CRAIGSLIST DES MOINES:
- Jabra Elite 85h Headphones: $150 (Des Moines)
- Schiit stack Asgard 3 - and Modius DAC: $300 (West Des Moines)
- Schiit headphone amplifier stack: $350 (Urbandale)
- 3 ear phones headphones buds wired green blue: $10 (Des Moines)
- HEADSET/EARBUDS / HEADPHONES: $0 (Des Moines)

OFFERUP (Columbus, OH - note location difference):
- BeLink Headphones: $250
- JBL Tune 520BT Wireless Bluetooth On-Ear Headphones Blue New Sealed: $60
- Apple AirPod Max: $150
- AirPods Pro (2nd Generation): $80
- Sony Wh-c710n Noise Cancelling: $85
- JBL Wireless Headphones: $50
- Beats Solo3 Wireless On-Ear Headphones: $125
- Skullcandy Crusher ANC 2 Wireless Over-Ear Bluetooth Headphones: $100

EBAY (from sold listings - extract representative prices):
- Similar headphones range from $50-$300
- AirPods Pro 2 typically sell for $100-140
- Sony WH-C710N typically $80-100
- JBL Tune series typically $50-80

Format the output with:
- Clear markdown table
- Mermaid chart in code block
- Best deal analysis

Use this Mermaid syntax:
\`\`\`mermaid
xychart-beta
    title \"Headphone Price Comparison\"
    x-axis [Product1, Product2, Product3]
    y-axis \"Price ($)\" 0 --> 400
    bar [price1, price2, price3]
\`\`\`" system="You are a data analyst and visualization expert. Create clear, formatted comparisons with Mermaid charts and markdown tables. Always use proper Mermaid syntax in code blocks."
```

## What This Will Generate

1. ✅ **Summary Table** - All products with prices across platforms
2. ✅ **Mermaid Bar Chart** - Visual price comparison
3. ✅ **Best Deal Analysis** - Recommendations

## Alternative: Use LangChain for More Processing

If you want more sophisticated analysis:

```
/langchain-agent agent_executor query="Analyze this headphone price data and create: 1) Summary table, 2) Mermaid bar chart, 3) Best deal recommendations, 4) Price trend analysis. 

[Paste your scraped data here]

Format output with markdown tables and Mermaid charts in code blocks." system_instruction="You are a data analyst. Process price data, create visualizations, and provide insights. Always format Mermaid charts in markdown code blocks."
```

## Expected Output Format

The command will generate something like:

```markdown
## Headphone Price Comparison Summary

### Price Comparison Table

| Product | Craigslist | OfferUp | eBay Avg | Best Deal | Savings |
|---------|-----------|---------|----------|-----------|---------|
| Jabra Elite 85h | $150 | $250 | $130 | Craigslist | $20 |
| AirPods Pro 2 | - | $80 | $120 | OfferUp | $40 |
| Sony WH-C710N | - | $85 | $90 | OfferUp | $5 |
| JBL Tune 520BT | - | $60 | $70 | OfferUp | $10 |

### Price Comparison Chart

\`\`\`mermaid
xychart-beta
    title "Headphone Price Comparison"
    x-axis [Jabra Elite 85h, AirPods Pro 2, Sony WH-C710N, JBL Tune 520BT]
    y-axis "Price ($)" 0 --> 300
    bar [150, 80, 85, 60]
\`\`\`

### Best Deals

1. **Jabra Elite 85h**: $150 on Craigslist (save $20 vs eBay)
2. **AirPods Pro 2**: $80 on OfferUp (save $40 vs eBay)
3. **JBL Tune 520BT**: $60 on OfferUp (save $10 vs eBay)
```

## Try It Now!

Just copy the first command above and paste it into your chat. It will process all your scraped data and create beautiful visualizations!








