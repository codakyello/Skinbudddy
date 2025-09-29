// "use client";

// import algoliasearch from "algoliasearch/lite";
// import {
//   InstantSearch,
//   SearchBox,
//   Hits,
//   Pagination,
//   RefinementList,
//   Stats,
//   Configure,
// } from "@algolia/react-instantsearch";
// import type { FunctionComponent } from "react";

// // Helper to safely read browser-exposed env vars
// function readPublicEnv(name: string) {
//   return (process.env as Record<string, string | undefined>)[name];
// }

// // Env vars expected: NEXT_PUBLIC_ALGOLIA_APP_ID, NEXT_PUBLIC_ALGOLIA_SEARCH_KEY, NEXT_PUBLIC_ALGOLIA_INDEX
// const APP_ID = readPublicEnv("NEXT_PUBLIC_ALGOLIA_APP_ID");
// const SEARCH_KEY = readPublicEnv("NEXT_PUBLIC_ALGOLIA_SEARCH_KEY"); // search-only key
// const INDEX_NAME = readPublicEnv("NEXT_PUBLIC_ALGOLIA_INDEX") || "products";

// // A minimal Hit card. Adjust field names to your index schema.
// const HitCard: FunctionComponent<{ hit: any }> = ({ hit }) => {
//   return (
//     <article
//       style={{
//         border: "1px solid #e5e7eb",
//         borderRadius: 8,
//         padding: 12,
//         display: "flex",
//         gap: 12,
//       }}
//     >
//       {hit.image ? (
//         // eslint-disable-next-line @next/next/no-img-element
//         <img
//           src={hit.image}
//           alt={hit.name}
//           style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }}
//         />
//       ) : null}
//       <div style={{ minWidth: 0, flex: 1 }}>
//         <h3
//           style={{
//             fontSize: 14,
//             fontWeight: 600,
//             margin: 0,
//             overflow: "hidden",
//             textOverflow: "ellipsis",
//             whiteSpace: "nowrap",
//           }}
//         >
//           {hit.name}
//         </h3>
//         <div
//           style={{
//             display: "flex",
//             gap: 8,
//             alignItems: "center",
//             marginTop: 4,
//             color: "#4b5563",
//             fontSize: 12,
//           }}
//         >
//           {hit.brand ? <span>{hit.brand}</span> : null}
//           {hit.category ? <span>• {hit.category}</span> : null}
//         </div>
//         {hit.price != null ? (
//           <div style={{ marginTop: 6, fontWeight: 600 }}>
//             ₦{new Intl.NumberFormat("en-NG").format(Number(hit.price))}
//           </div>
//         ) : null}
//       </div>
//     </article>
//   );
// };

// export default function Page() {
//   // If required env vars are missing, show a helpful panel instead of crashing
//   if (!APP_ID || !SEARCH_KEY) {
//     return (
//       <div style={{ padding: "32px 24px" }}>
//         <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
//           Search
//         </h1>
//         <div
//           style={{
//             border: "1px solid #fde68a",
//             background: "#fffbeb",
//             borderRadius: 8,
//             padding: 16,
//           }}
//         >
//           <strong style={{ display: "block", marginBottom: 6 }}>
//             Algolia not configured
//           </strong>
//           <p style={{ margin: 0, fontSize: 14 }}>
//             Please set <code>NEXT_PUBLIC_ALGOLIA_APP_ID</code> and{" "}
//             <code>NEXT_PUBLIC_ALGOLIA_SEARCH_KEY</code> in{" "}
//             <code>.env.local</code>, then restart your dev server.
//           </p>
//           <pre
//             style={{
//               marginTop: 12,
//               background: "#111827",
//               color: "#fff",
//               padding: 12,
//               borderRadius: 6,
//               overflowX: "auto",
//             }}
//           >
//             {`NEXT_PUBLIC_ALGOLIA_APP_ID=YOUR_APP_ID
// NEXT_PUBLIC_ALGOLIA_SEARCH_KEY=YOUR_SEARCH_ONLY_KEY
// NEXT_PUBLIC_ALGOLIA_INDEX=products`}
//           </pre>
//         </div>
//       </div>
//     );
//   }

//   const searchClient = algoliasearch(APP_ID, SEARCH_KEY);

//   return (
//     <div style={{ padding: "32px 24px" }}>
//       <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
//         Search
//       </h1>

//       <InstantSearch searchClient={searchClient} indexName={INDEX_NAME}>
//         {/* Default search params */}
//         <Configure
//           hitsPerPage={12}
//           attributesToRetrieve={["name", "brand", "category", "price", "image"]}
//         />

//         <div
//           style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}
//         >
//           {/* Sidebar filters */}
//           <aside>
//             <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
//               Filters
//             </h2>
//             {/* Update facet attributes to match your index */}
//             <div style={{ marginBottom: 20 }}>
//               <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
//                 Brand
//               </div>
//               <RefinementList attribute="brand" />
//             </div>
//             <div style={{ marginBottom: 20 }}>
//               <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
//                 Category
//               </div>
//               <RefinementList attribute="category" />
//             </div>
//           </aside>

//           {/* Main content */}
//           <main>
//             <div style={{ marginBottom: 12 }}>
//               <SearchBox placeholder="Search products…" autoFocus />
//             </div>
//             <Stats />

//             <div
//               style={{
//                 marginTop: 16,
//                 display: "grid",
//                 gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
//                 gap: 12,
//               }}
//             >
//               <Hits hitComponent={HitCard as any} />
//             </div>

//             <div style={{ marginTop: 16 }}>
//               <Pagination />
//             </div>
//           </main>
//         </div>
//       </InstantSearch>
//     </div>
//   );
// }
