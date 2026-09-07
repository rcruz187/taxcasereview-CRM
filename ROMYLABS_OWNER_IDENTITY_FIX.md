# RomyLabs Platform Owner Identity Fix

The RomyLabs admin hostname now normalizes the legacy hard-coded `romy@taxrescrm.net` display value to `romy@romylabs.com` at runtime. This protects the admin UI while the legacy AdminPortal component is subsequently refactored to read the authenticated user's email directly.
