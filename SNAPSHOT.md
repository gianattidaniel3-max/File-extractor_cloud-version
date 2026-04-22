# Project Snapshot: File Extractor_CLOUD VERSION

**State:** Technical Design Validated (Pending User Approval)

**Project Aspects:**
- **Objective:** Analyze, categorize, and extract Italian legal documents with zero local CPU overhead using Cloud Vision APIs.
- **Language / Portability:** Python (Backend) + Vanilla HTML/JS (Frontend). Using pure PIP dependencies (`pymupdf`) to guarantee 100% seamless portability between macOS and Windows.
- **Persistence:** SQLite (for structured JSON storage) and local filesystem (for PDF archiving), allowing historical cross-examination.
- **UI/UX:** Minimalist split-view layout to view PDFs side-by-side with extracted data. (Awaiting color palette image from user).

**Next Steps:**
1. User approves the implementation plan.
2. User provides the color palette image.
3. Begin scaffolding backend and frontend.
