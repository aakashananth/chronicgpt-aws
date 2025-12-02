# Dashboard Layout Suggestions

## Current Components Inventory

1. **Header** - Title, patient info, dark mode toggle, view mode selector
2. **Today's Health Card** - Large readiness score (71/100) with date picker
3. **Quick Stats Panel** - Avg readiness, anomalous days, streaks, best/worst days, week-over-week
4. **Summary Cards (4x)** - HRV, Resting HR, Sleep Score, Steps (with trends)
5. **Quick Filters** - Filter buttons (Anomalous Only, Show All, Low Sleep, Low Steps)
6. **Anomaly Cards (6x)** - Grid of anomaly flag cards
7. **Heatmap Calendar** - 90-day readiness heatmap
8. **Date Range Controls** - Preset buttons and custom date range
9. **Charts Section (4x)** - HRV, Resting HR, Sleep Score, Steps charts (2x2 grid)
10. **Daily AI Summary** - Explanation text with insights and flags
11. **Last 30 Days Table** - Right sidebar table with metrics

---

## Layout Option 1: **"At-a-Glance" Layout** (Recommended)
**Best for: Quick daily check-ins and overview**

### Desktop Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Header (Title, Patient, Toggle, View Selector)              │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌─────────────────────────────┐ │
│ │ Today's Health       │  │ Quick Stats Panel            │ │
│ │ (Large Score Card)   │  │ (Compact Stats)              │ │
│ └──────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
│ │ HRV  │ │ RHR  │ │Sleep │ │Steps │  Summary Cards Row    │
│ └──────┘ └──────┘ └──────┘ └──────┘                       │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Heatmap Calendar (90 days)                              │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌─────────────────────────────┐ │
│ │ Charts (2x2)         │  │ Last 30 Days Table          │ │
│ │                      │  │                             │ │
│ └──────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Anomaly Cards (3x2 grid)                               │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Daily AI Summary                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Today's Health prominently at top left
- Quick Stats as companion card (top right)
- Heatmap visible early for pattern recognition
- Charts and table side-by-side for comparison
- Anomaly cards grouped together
- AI Summary at bottom for context

---

## Layout Option 2: **"Analytical" Layout**
**Best for: Deep analysis and trend investigation**

### Desktop Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌─────────────────────────────┐ │
│ │ Today's Health       │  │ Quick Stats + Filters        │ │
│ │                      │  │ (Combined compact)           │ │
│ └──────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
│ │ HRV  │ │ RHR  │ │Sleep │ │Steps │                       │
│ └──────┘ └──────┘ └──────┘ └──────┘                       │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Date Range Controls                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌─────────────────────────────┐ │
│ │ Charts (2x2)         │  │ Last 30 Days Table          │ │
│ │                      │  │                             │ │
│ └──────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌─────────────────────────────┐ │
│ │ Heatmap Calendar     │  │ Anomaly Cards (3x2)         │ │
│ └──────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Daily AI Summary                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Date controls positioned before charts for easy filtering
- Charts and table side-by-side for data analysis
- Heatmap and anomalies side-by-side for pattern correlation
- More horizontal space utilization

---

## Layout Option 3: **"Mobile-First Progressive" Layout**
**Best for: Responsive design prioritizing mobile experience**

### Mobile (< 768px):
```
┌─────────────────────┐
│ Header              │
├─────────────────────┤
│ Today's Health      │
├─────────────────────┤
│ Quick Stats         │
├─────────────────────┤
│ ┌───┐ ┌───┐         │
│ │HRV│ │RHR│         │
│ └───┘ └───┘         │
│ ┌───┐ ┌───┐         │
│ │Slp│ │Stp│         │
│ └───┘ └───┘         │
├─────────────────────┤
│ Filters             │
├─────────────────────┤
│ Heatmap             │
├─────────────────────┤
│ Charts (stacked)    │
├─────────────────────┤
│ Anomaly Cards       │
├─────────────────────┤
│ AI Summary          │
├─────────────────────┤
│ Date Range          │
└─────────────────────┘
```

### Tablet (768px - 1024px):
```
┌─────────────────────────────────────┐
│ Header                              │
├─────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐  │
│ │Today's Health│ │ Quick Stats  │  │
│ └──────────────┘ └──────────────┘  │
├─────────────────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                │
│ │HR│ │RH│ │Sl│ │St│                │
│ └──┘ └──┘ └──┘ └──┘                │
├─────────────────────────────────────┤
│ Heatmap                             │
├─────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐  │
│ │ Charts (2x2) │ │ Table        │  │
│ └──────────────┘ └──────────────┘  │
├─────────────────────────────────────┤
│ Anomaly Cards (3x2)                 │
├─────────────────────────────────────┤
│ AI Summary                          │
└─────────────────────────────────────┘
```

### Desktop (> 1024px):
```
┌─────────────────────────────────────────────────────────┐
│ Header                                                   │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │Today's Health│ │ Quick Stats  │ │ Filters      │     │
│ └──────────────┘ └──────────────┘ └──────────────┘     │
├─────────────────────────────────────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                                     │
│ │HR│ │RH│ │Sl│ │St│                                     │
│ └──┘ └──┘ └──┘ └──┘                                     │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌──────────────────────────┐  │
│ │ Heatmap              │ │ Last 30 Days Table       │  │
│ └──────────────────────┘ └──────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌──────────────────────────┐  │
│ │ Charts (2x2)         │ │ Anomaly Cards (3x2)      │  │
│ └──────────────────────┘ └──────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ AI Summary                                              │
└─────────────────────────────────────────────────────────┘
```

---

## Layout Option 4: **"Card-Based Dashboard" Layout**
**Best for: Modular, scannable information**

### Desktop Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Today's Health (Full Width Hero Card)                   │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ │ Quick Stats  │ │ Heatmap      │ │ AI Summary   │         │
│ │              │ │              │ │ (Compact)    │         │
│ └──────────────┘ └──────────────┘ └──────────────┘         │
├─────────────────────────────────────────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐                                         │
│ │HR│ │RH│ │Sl│ │St│  Summary Cards                          │
│ └──┘ └──┘ └──┘ └──┘                                         │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌─────────────────────────────┐ │
│ │ Charts (2x2)         │ │ Last 30 Days Table          │ │
│ └──────────────────────┘ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Anomaly Cards (6 cards in 3x2 grid)                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Hero card for today's health (full width)
- Three equal cards: Stats, Heatmap, AI Summary
- More balanced visual weight
- Easy to scan

---

## Recommended Implementation: **Option 1 (At-a-Glance)**

### Why This Layout Works Best:

1. **Information Hierarchy:**
   - Most important (Today's Health) at top
   - Quick context (Stats) immediately visible
   - Visual patterns (Heatmap) early for quick insights

2. **User Flow:**
   - Check score → Review stats → See patterns → Analyze details
   - Natural top-to-bottom reading flow

3. **Space Efficiency:**
   - Charts and table side-by-side maximizes screen use
   - Doesn't feel cramped

4. **Responsive:**
   - Stacks naturally on mobile
   - Progressive enhancement on larger screens

### Implementation Notes:

- **Today's Health + Quick Stats**: Side-by-side on desktop, stacked on mobile
- **Summary Cards**: Always 4 columns on desktop, 2 on tablet, 1 on mobile
- **Heatmap**: Full width, positioned after summary cards
- **Charts + Table**: Side-by-side on desktop (60/40 split), stacked on mobile
- **Anomaly Cards**: 3 columns on desktop, 2 on tablet, 1 on mobile
- **AI Summary**: Full width at bottom

### Breakpoints:
- Mobile: < 640px (sm)
- Tablet: 640px - 1024px (sm to lg)
- Desktop: > 1024px (lg+)

---

## Additional Suggestions:

1. **Sticky Elements:**
   - Keep header sticky on scroll
   - Keep "Last 30 Days" table sticky in right column

2. **Collapsible Sections:**
   - Make Quick Stats collapsible
   - Make Anomaly Cards collapsible (expand to see all)

3. **View Mode Adaptations:**
   - **Overview Mode**: Show all components
   - **Metric-Specific Mode**: Hide summary cards, show detailed MetricView, keep table

4. **Empty States:**
   - Show helpful messages when no data
   - Guide users to select date ranges

5. **Loading States:**
   - Skeleton loaders for each card
   - Progressive loading (show available data first)

