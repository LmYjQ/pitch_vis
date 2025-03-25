import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("../views/FileView.vue"),
    },
    {
      path: "/m",
      name: "microphone",
      component: () => import("../views/MicrophoneView.vue"),
    },
    {
      path: "/multi-recorder",
      name: "MultiRecorder",
      component: () => import("../views/MultiRecorder.vue"),
    },
  ],
});

export default router;
