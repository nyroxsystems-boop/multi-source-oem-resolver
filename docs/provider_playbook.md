# OEM Scraper Playbook (Autodoc, PartSouq, RealOEM, 7zap)

This summarizes the intended navigation and extraction paths for each provider. Use Playwright headless, respect ToS/robots, and keep selectors configurable.

## General Flow
- Select the exact vehicle first (VIN preferred; else brand/model/year/engine).
- Navigate to the relevant part category/diagram.
- Extract OEM numbers from EPC tables or OE sections.
- Stop early when a high-confidence OEM comes from an EPC source.

## Autodoc (Cross-ref)
1) Vehicle selection via VIN/KBA/HSN-TSN or brand/model/engine on homepage.  
2) Search part (e.g., "spark plug") or use category tree (Engine → Ignition). Ensure listing is filtered to the selected car.  
3) Open product detail page(s); expand "OE/OEM numbers" section/tab.  
4) Extract all OEM references shown. Confidence: medium (cross-reference).

## PartSouq (OEM EPC)
1) Preferred: enter VIN on homepage, submit, wait for decoded vehicle.  
2) If VIN fails: Genuine Catalogs → pick brand, model code, year, engine/market.  
3) Navigate categories → subcategories to relevant diagram (e.g., Engine → Ignition → Spark plug).  
4) On diagram page/table: match description to part query, extract OEM part numbers. Confidence: high.

## RealOEM (BMW/MINI EPC)
1) If VIN: enter last 7 chars, submit to decode vehicle. Else: manual series/model/body/production date.  
2) Open main group + subgroup matching part (e.g., Engine → Electrical → Spark plug).  
3) Diagram page: parts table with "Part Number". Filter rows by description matching part query. Extract OEM numbers (11-digit). Confidence: very high.

## 7zap (Multi-brand EPC)
1) Enter OEM catalog; choose category (Cars/Trucks/Moto) and brand/subdomain.  
2) If VIN supported: decode VIN; else manual model/year/body/engine selection.  
3) Navigate catalog groups to the correct diagram.  
4) In diagram table, match description or index; extract OEM numbers. If replacements shown, prefer latest. Confidence: high when from EPC.

## Orchestration Strategy
1) BMW → RealOEM first; if OEM found, stop.  
2) Other brands → PartSouq (VIN/model). If OEM found, stop.  
3) Else 7zap. If OEM found, stop.  
4) Autodoc optionally as cross-ref to confirm OEMs.  
5) Use scoring: EPC sources weighted higher (RealOEM ~0.95, PartSouq ~0.9, 7zap ~0.75); cross-ref lower (~0.7); fallback lowest.

## Extraction Heuristics
- Normalize OEM: uppercase, strip non A-Z/0-9; `looksLikeOem`: length >= 7.  
- Parts tables: iterate `table tr`, pick description cell, OEM cell (last or known index), filter by part query keywords.  
- Text/OE blocks: scan text nodes for OEM-like tokens, normalize, dedupe.

## Logging & Early Stop
- Log URLs, rows found, sample OEMs per provider.  
- After each provider, rescore; if primary confidence ≥ 0.9, stop chain.  
- If no candidates, run fallback only as last resort.
