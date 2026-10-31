// Every page with no breadcrumbs (the flat pages, a 404): nothing. A slot
// keeps what it showed on a client-side navigation to a path it does not
// match, so it matches every path and renders null
// (nextjs.org/docs/app/api-reference/file-conventions/parallel-routes,
// "Modals": the catch-all slot).
export default function CatchAll() {
  return null;
}
