---
Task ID: 2
Agent: Super Z (Main)
Task: Simplify dashboard - only >5min = dead time, show all movements with red highlighting

Work Log:
- Rewrote /api/stats to only count gaps > 300s (5 min) as dead time
- Created /api/movements with pagination (200 per page) returning ALL scan records with computed gaps
- Rewrote page.tsx to be much simpler: 4 KPIs, 1 summary box, 1 chart, 1 full movement table
- Red highlighting (bg-red-50 + red badge) only for gaps > 5 minutes
- Summary box shows total dead time, event count, and threshold
- Verified with Agent Browser: 200 rows, 7 red rows on page 1, correct data

Stage Summary:
- KPIs: Total escaneos (22,731), Tiempo muerto total (147h 29m), Promedio gap (65.3s), Máximo (43m 26s)
- 853 events > 5 min found, totaling 147.5 hours of dead time
- All movements visible with pagination, red rows for > 5 min gaps
- Simplified from 3 tabs + 5 charts to single-page layout