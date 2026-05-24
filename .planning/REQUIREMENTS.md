# Requirements: BrewIndex

**Defined:** 2026-05-24
**Core Value:** A newcomer can discover, understand, and install any macOS app available via Homebrew without ever needing to know the CLI exists.

## v1 Requirements

### Browse & Navigation

- [ ] **BRWS-01**: User can browse all Homebrew casks in a visual card grid layout showing name, icon, and short description
- [ ] **BRWS-02**: User can filter casks by category (Developer Tools, Productivity, Design, etc.)
- [ ] **BRWS-03**: User can sort the browse grid by popularity (install count), alphabetically, or most recently updated
- [ ] **BRWS-04**: User can paginate or infinitely scroll through 7,000+ casks without performance degradation

### Search

- [ ] **SRCH-01**: User can search casks by name and get results from the database (server-side)
- [ ] **SRCH-02**: User can filter search results by macOS platform compatibility

### Detail Page

- [ ] **DETL-01**: User can view a cask detail page with name, icon, description, version, and homepage link
- [ ] **DETL-02**: User can copy the `brew install --cask <name>` command to clipboard in one click
- [ ] **DETL-03**: User can see current version and last updated date for a cask
- [ ] **DETL-04**: User can see 30-day, 90-day, and 365-day install counts for a cask
- [ ] **DETL-05**: User can see GitHub stars, forks, and open issues for casks that have an upstream GitHub repo

### Data Pipeline

- [ ] **DATA-01**: Cask data is synced from the Homebrew JSON API daily via an automated cron job into Neon Postgres
- [ ] **DATA-02**: Cask icons are fetched from the homepage domain favicon at sync time and stored in Vercel Blob (not hotlinked)
- [ ] **DATA-03**: GitHub stats (stars, forks, issues, license) are enriched at sync time for casks with a GitHub upstream repo

### Security

- [ ] **SECU-01**: All API routes exposed to the public are protected by per-IP rate limiting (Upstash ratelimit)
- [ ] **SECU-02**: Vercel WAF rules are configured to block known bot patterns and abusive traffic at the edge
- [ ] **SECU-03**: The cron sync trigger endpoint is protected by CRON_SECRET bearer token validation
- [ ] **SECU-04**: All server-side fetch calls are restricted to an explicit hostname allowlist (formulae.brew.sh, api.github.com, Blob storage) to prevent SSRF

## v2 Requirements

### Search Enhancements

- **SRCH-03**: User can search across cask name and description using full-text search (Postgres tsvector/GIN)
- **SRCH-04**: User can search by tag or license type

### Browse Enhancements

- **BRWS-05**: Home page features editorial sections (trending, recently updated, staff picks, new arrivals)
- **BRWS-06**: User can browse by dependency — see what a cask depends on and what depends on it

### Detail Page Enhancements

- **DETL-06**: User can see direct download link to binary bottle (.dmg/.pkg) when available
- **DETL-07**: User can see macOS version compatibility matrix
- **DETL-08**: User can see cask caveats and install warnings

### Formulae

- **FORM-01**: User can browse and search Homebrew formulae (CLI tools) with the same UI
- **FORM-02**: Formulae and casks are searchable together with a type filter

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / login | Read-only public catalog; no personalization needed in v1 |
| Favorites / saved casks | Requires accounts; deferred with accounts |
| Mobile app | Web-first; responsive web is sufficient for v1 |
| Real-time sync | Homebrew publishes once daily; live sync adds cost and complexity without benefit |
| Full-text description search | Basic name search is sufficient for v1; FTS is a v2 upgrade |
| Formulae support | Casks first; formulae deferred to next milestone |
| User reviews or ratings | Out of scope; catalog is read-only and Homebrew has no such data |

## Traceability

Which phases cover which requirements. Confirmed during roadmap creation (2026-05-24).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| SECU-03 | Phase 1 | Pending |
| SECU-04 | Phase 1 | Pending |
| BRWS-01 | Phase 2 | Pending |
| BRWS-04 | Phase 2 | Pending |
| DETL-01 | Phase 2 | Pending |
| DETL-02 | Phase 2 | Pending |
| DETL-03 | Phase 2 | Pending |
| DETL-04 | Phase 2 | Pending |
| SRCH-01 | Phase 3 | Pending |
| SRCH-02 | Phase 3 | Pending |
| SECU-01 | Phase 3 | Pending |
| SECU-02 | Phase 3 | Pending |
| DETL-05 | Phase 4 | Pending |
| BRWS-02 | Phase 4 | Pending |
| BRWS-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-24*
*Last updated: 2026-05-24 after roadmap creation — traceability confirmed*
