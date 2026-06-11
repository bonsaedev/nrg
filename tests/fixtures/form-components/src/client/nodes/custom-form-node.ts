import { defineNode } from "@bonsae/nrg/client";
import CustomFormNodeForm from "../components/custom-form-node.vue";

export default defineNode({
  type: "custom-form-node",
  form: {
    component: CustomFormNodeForm,
  },
});
