// "use node";
// import * as Sentry from "@sentry/nextjs";

// export function captureSentryErrorSimple(
//   error: unknown,
//   user?: { id?: string; email?: string; firstName?: string }
// ) {
//   if (user?.id) {
//     Sentry.setUser({
//       id: user.id,
//       email: user.email,
//       username: user.firstName,
//     });
//   }
//   Sentry.captureException(error);
// }

// export async function captureSentryError(
//   ctx: any,
//   error: unknown,
//   userId?: string
// ) {
//   try {
//     const user = await ctx.db.collection("users").findOne({ _id: userId });
//     if (user) {
//       captureSentryErrorSimple(error, {
//         id: user._id,
//         email: user.email,
//         firstName: user.firstName,
//       });
//     } else {
//       captureSentryErrorSimple(error);
//     }
//   } catch {
//     captureSentryErrorSimple(error);
//   }
// }

// // Optionally, you can create wrappers for mutation/query to automatically include Sentry
// // export function sentryMutation<Args extends any, Return>({
// //   args,
// //   handler,
// // }: {
// //   args: Args;
// //   handler: (ctx: any, args: Args) => Promise<Return>;
// // }) {
// //   return mutation({
// //     args: args,
// //     handler: async (ctx, args: Args) => {
// //       try {
// //         return await handler(ctx, args);
// //       } catch (error) {
// //         // You might want to extract user info from ctx here if available
// //         // const user = await ctx.auth.getUserIdentity();
// //         // captureSentryError(error, { id: user?.subject, email: user?.email, name: user?.name });
// //         captureSentryError(error);
// //         throw error;
// //       }
// //     },
// //   });
// // }

// // export function sentryQuery<Args extends any, Return>({
// //   args,
// //   handler,
// // }: {
// //   args: Args;
// //   handler: (ctx: any, args: Args) => Promise<Return>;
// // }) {
// //   return query({
// //     args: args,
// //     handler: async (ctx, args: Args) => {
// //       try {
// //         return await handler(ctx, args);
// //       } catch (error) {
// //         // You might want to extract user info from ctx here if available
// //         // const user = await ctx.auth.getUserIdentity();
// //         // captureSentryError(error, { id: user?.subject, email: user?.email, name: user?.name });
// //         captureSentryError(error);
// //         throw error;
// //       }
// //     },
// //   });
// // }
