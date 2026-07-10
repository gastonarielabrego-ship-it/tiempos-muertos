---
Task ID: 1
Agent: main
Task: Agregar pestañas Prep. STD y Prep. XD que repliquen Ranking y Por Operador filtrados por ZONSTS

Work Log:
- Modified 4 API routes (stats, movements, export-ranking, export-operator) to accept `zona` query param
  - `zona=std`: filters scans where zonSts does NOT contain "V"
  - `zona=xd`: filters scans where zonSts contains "V"
- Added TabType values: 'prep-std' | 'prep-xd'
- Added state variables for STD and XD (stats, gaps, pagination, loading, selectedOp)
- Added fetchZonaStats and fetchZonaGaps callback functions
- Added useEffect triggers for STD/XD data fetching
- Added "Prep. STD" (blue theme) and "Prep. XD" (purple theme) tab buttons
- Added full ranking table rendering for both tabs (same columns as original ranking)
- Added operator detail (gaps) rendering for both tabs when an operator is clicked
- Both tabs include: download Excel button, back navigation, pagination
- Build compiles successfully with no errors

Stage Summary:
- 4 API routes modified with zona filtering
- 2 new tabs added to page.tsx (file grew from ~1467 to ~1990 lines)
- Each tab has ranking view + operator detail view
- STD uses blue theming, XD uses purple theming