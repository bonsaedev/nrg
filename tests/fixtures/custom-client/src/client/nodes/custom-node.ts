import { defineNode } from "@bonsae/nrg/client";
import CustomNodeForm from "../components/custom-node.vue";

export default defineNode({
  type: "custom-node",
  form: {
    component: CustomNodeForm,
  },
});
