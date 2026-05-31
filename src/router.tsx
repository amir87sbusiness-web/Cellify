// src/router.tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  // تغییر به '/' برای سازگاری بهتر با تمام هاست‌ها
  basepath: '/', 
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}