import LineCharts from "./charts/LineCharts.vue";

export default {
  install(app) {
    app.component(LineCharts.name, LineCharts);
  },
};
