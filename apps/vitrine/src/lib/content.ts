// The site's default content now lives in @mydaust/shared so the API and the portal
// CMS share one source of truth. This re-export keeps existing "@/lib/content" imports
// working; the CMS's runtime text/image overrides are applied via buildSiteContent().
export * from "@mydaust/shared";
