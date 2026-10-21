import { handle } from "../server/handler.js";

// Одна функция на всё API: Vercel Fluid переиспользует тёплые экземпляры между маршрутами.
export default {
  fetch(request: Request) {
    return handle(request);
  },
};
