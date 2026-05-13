import { Hono } from "hono";
import { authRouter } from "./routes/auth";
import { familyRouter } from "./routes/family";
import { photosRouter } from "./routes/photos";
import { ratingsRouter } from "./routes/ratings";
import { searchRouter } from "./routes/search";
import { shareRouter } from "./routes/share";
import type { AppVariables, Env } from "./types";

const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

api.route("/auth", authRouter);
api.route("/search", searchRouter);
api.route("/ratings", ratingsRouter);
api.route("/share", shareRouter);
api.route("/family", familyRouter);
api.route("/photos", photosRouter);

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.route("/api", api);

app.all("*", (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api")) {
    return c.text("Not found", 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
