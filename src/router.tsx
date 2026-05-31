import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

// اکسپورت مستقیم ساختار روتور برای حالت مستقل SPA
export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  basepath: '/Cellify', // 👈 این خط برای هماهنگی با گیت‌هاب اضافه شد
});

// تعریف تایپ‌ها برای پشتیبانی کامل در کامپوننت‌ها
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}