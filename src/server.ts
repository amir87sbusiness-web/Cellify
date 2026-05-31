import { createRequestHandler } from "@tanstack/start/server";
import { defaultHandler } from "@tanstack/start/server";

// ایجاد هندلر استاندارد و بومی سرور بدون وابستگی به ابزارهای نظارتی Lovable
export default createRequestHandler({
  requestHandler: defaultHandler,
});