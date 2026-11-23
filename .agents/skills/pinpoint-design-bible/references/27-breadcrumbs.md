# 27. Breadcrumbs

One breadcrumb style for every page that sits inside a section: tag, tag type, Collection, settings tag, and Help pages. Feature specs say which crumbs a page shows and who sees them; this section says how they look.

- **Place:** on its own line directly above the page title, at every width. It never sits beside the title.
- **Look:** each crumb is a link in the primary green, medium weight. The section's navigation icon comes before the first crumb, in the same green: `Tag` for Tags and Settings tags, `Library` for Collections, `HelpCircle` for Help. Crumbs are separated by a muted "›".
- **One line, always.** When the breadcrumb does not fit, the last crumb shortens with an ellipsis; the first crumb never shortens.
- **The current page is never a crumb.** The title names it.
- **Pages at the top of a section** (Machines, Issues, Dashboard, Tags, Collections, Help) have no breadcrumb.
- Every breadcrumb is a `nav` named "Breadcrumb", drawn by the one shared breadcrumb component; a page never draws its own.
