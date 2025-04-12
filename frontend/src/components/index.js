import LineCharts from "./charts/LineCharts.vue";
import DynamicsLineCharts from "./charts/DynamicsLineCharts.vue";

export default {
  install(app) {
    app.component(LineCharts.name, LineCharts);
    app.component(DynamicsLineCharts.name, DynamicsLineCharts);
  },
};
