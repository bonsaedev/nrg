import { defineNode } from "@bonsae/nrg/client";
import ExampleForm from "../components/example-form.vue";

export default defineNode({
  type: "example-node",
  form: {
    component: ExampleForm,
  },
});
