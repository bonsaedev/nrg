<template>
  <div class="nrg-form-app">
    <!-- Official JSON Schema logo, defined once as a symbol and referenced by
         the per-port Schema buttons via <use>. `fill="currentColor"` lets the
         button's color (blue normally, red on an invalid schema) drive it. -->
    <svg
      class="nrg-json-schema-logo-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <symbol id="nrg-json-schema-logo" viewBox="0 0 256 220">
        <path
          fill="currentColor"
          d="M70.2063725,0 L70.2063725,16.7669464 C63.5900004,16.7669464 58.3734386,17.798983 54.5844902,19.8489231 C50.7955417,21.8988245 48.1094507,25.0797726 46.5405047,29.3916515 C44.9711727,33.7035691 44.1795558,39.2031822 44.1795558,45.8759328 L44.1795558,80.1166428 C44.1795558,84.5697771 43.5999379,88.6274891 42.4264142,92.2747188 C41.2528905,95.9223347 39.1039404,99.0606127 35.9655466,101.690325 C32.8129036,104.320038 28.3596149,106.341557 22.5632806,107.769556 C21.8281582,107.939078 20.9940644,108.080411 20.2023317,108.236031 L20.2023317,110.879645 L21.8004023,111.178071 C22.0622022,111.229887 22.3182398,111.28485 22.5632806,111.34612 C28.3596149,112.774119 32.8270369,114.795638 35.9655466,117.425351 C39.1039404,120.054677 41.2528905,123.193341 42.4264142,126.840957 C43.5999379,130.502475 44.1795558,134.545513 44.1795558,138.999033 L44.1795558,173.239743 C44.1795558,179.926781 44.9711727,185.397819 46.5405047,189.681432 C48.1094507,193.965044 50.7955417,197.146185 54.5844902,199.224469 C58.3734386,201.302367 63.5900004,202.348845 70.2063725,202.348845 L70.2063725,219.129577 C61.8086695,219.129577 54.7682997,218.210916 49.0566878,216.387108 C43.345462,214.5633 38.793086,211.764066 35.3576621,208.003693 C31.9222767,204.242933 29.4623564,199.478945 27.9496346,193.710568 C26.4369514,187.942578 25.6876571,181.128494 25.6876571,173.254031 L25.6876571,145.869881 C25.6876571,136.510653 23.7791268,129.837903 19.9902942,125.836955 C16.1873284,121.836008 9.5285952,119.842678 0,119.842678 L0,99.301187 C9.5285952,99.301187 16.2014617,97.3078572 19.9902942,93.3069099 C23.7932601,89.3059626 25.6876571,82.633212 25.6876571,73.2739842 L25.6876571,45.8759328 C25.6876571,38.0013534 26.4369514,31.1871157 27.9496346,25.419048 C29.4623564,19.6509802 31.9222767,14.8866826 35.3576621,11.1261166 C38.793086,7.3655891 43.345462,4.56639339 49.0566878,2.74265496 C54.7682997,0.918931981 61.8229572,0 70.2063725,0 Z M185.793628,0 C194.177043,0 201.2317,0.918931981 206.942926,2.74265496 C212.654538,4.56639339 217.206914,7.3655891 220.642145,11.1261166 C224.063474,14.8866826 226.537566,19.6509802 228.050134,25.419048 C229.563087,31.1871157 230.312227,38.0013534 230.312227,45.8759328 L230.312227,73.2739842 C230.312227,82.633212 232.206701,89.3059626 236.009551,93.3069099 C239.7985,97.3078572 246.47125,99.301187 256,99.301187 L256,119.828777 C246.47125,119.828777 239.812401,121.822106 236.009551,125.823054 C232.220603,129.823615 230.312227,136.496752 230.312227,145.855593 L230.312227,173.239743 C230.312227,181.114207 229.563087,187.928676 228.050134,193.696667 C226.537566,199.464657 224.077762,204.229032 220.642145,207.989405 C217.220816,211.750164 212.654538,214.549398 206.942926,216.37282 C201.2317,218.196628 194.190944,219.115676 185.793628,219.115676 L185.793628,202.334558 C192.41,202.334558 197.626561,201.288465 201.41551,199.210181 C205.204072,197.131897 207.890163,193.951142 209.459495,189.66753 C211.028827,185.383918 211.820444,179.912494 211.820444,173.225455 L211.820444,138.984745 C211.820444,134.531611 212.400062,130.488187 213.573586,126.826669 C214.746723,123.179054 216.895673,120.040776 220.034338,117.411063 C223.172616,114.781737 227.640038,112.759831 233.436604,111.332218 C234.171842,111.148409 235.005936,111.020978 235.797552,110.865357 L235.797552,108.221743 L234.199559,107.916967 C233.937746,107.865151 233.681683,107.811776 233.436604,107.755269 C227.640038,106.341557 223.186903,104.320038 220.034338,101.690325 C216.895673,99.0606127 214.746723,95.9223347 213.573586,92.2747188 C212.400062,88.6274891 211.820444,84.5697771 211.820444,80.1166428 L211.820444,45.8759328 C211.820444,39.2031822 211.028827,33.7035691 209.459495,29.3916515 C207.890163,25.0797726 205.204072,21.8988245 201.41551,19.8489231 C197.626561,17.798983 192.41,16.7669464 185.793628,16.7669464 L185.793628,0 Z M201.670372,109.282124 C201.670372,110.257936 199.804473,112.717741 197.54238,114.753547 C193.751288,118.158012 188.207849,123.460858 182.974135,128.606735 L179.139144,132.404595 L174.027319,137.56951 C170.693445,140.990614 168.447565,143.430555 168.447565,143.735219 C168.447565,144.27236 172.434225,151.157109 177.326031,159.04586 L185.582015,172.391748 C185.949634,172.985267 185.878968,173.748695 185.412493,174.257647 L183.447353,175.7706 C181.962974,177.410598 180.959359,178.696879 180.761261,180.308688 C181.01823,181.0282 180.303186,181.478717 179.377416,181.91024 L178.287169,182.400874 C175.142208,183.862677 172.755992,182.324703 164.223729,172.472139 L160.197164,167.787323 C156.16131,163.157181 152.753231,159.63798 152.246065,159.625478 C150.959784,159.597289 136.723424,175.162407 125.710297,188.635339 C115.997737,200.51075 107.4448,200.751324 104.970708,198.418564 C100.800239,194.460094 101.408046,187.688488 106.54004,181.04354 L107.206599,180.214619 C109.7226,177.180318 115.109092,171.505584 121.238899,165.346795 L123.285887,163.299693 L126.946872,159.684501 C130.63413,156.072631 134.354688,152.516872 137.698851,149.432543 L142.335795,145.162832 L132.874534,124.847927 C127.159513,112.345955 127.648567,111.24418 135.923327,110.243236 L143.650651,109.381365 L150.365878,119.531824 C154.055585,125.116005 157.618247,129.682668 158.25463,129.682668 C158.846764,129.682668 164.635224,125.074796 171.44336,119.202365 L177.818422,113.674994 C185.511074,107.076756 187.100569,106.282631 190.205449,106.588205 L191.09553,106.695274 C193.519196,107.031905 195.693016,106.870138 196.463229,106.328949 L196.63762,106.172035 C197.938188,104.61699 201.670372,106.921175 201.670372,109.282124 Z M163.215943,16.3851099 C169.379742,16.3851099 170.29879,18.5341054 170.29879,18.5341054 C149.361104,29.4623178 131.647037,48.9435445 113.353351,84.8242529 L110.406644,90.6984078 L99.0320373,112.816596 C98.1349705,114.447728 97.9565883,112.170901 93.9476115,106.701876 L93.2640467,105.790128 C71.8915229,73.8845169 56.3134099,67.8887357 56.4070411,67.3834557 C64.6642824,62.0631453 80.1305444,67.2658056 89.6874833,75.7623641 L90.0408147,76.101794 L90.9868899,76.9269196 C92.5445197,78.3256329 93.2759284,79.2291111 95.5968064,81.8130197 C95.8286801,81.8130197 98.2754368,77.9518231 100.816953,73.8376482 L106.736979,64.1271414 C128.027996,30.5508875 150.29444,16.3569275 163.215943,16.3851099 Z"
        />
      </symbol>
    </svg>
    <!-- Vue-driven schema editor tray (renders into a RED tray on open()). -->
    <NodeRedSchemaTray ref="schemaTray" />
    <!-- 1. Node fields (schema-driven, name first) -->
    <div style="width: 100%; padding-bottom: 12px">
      <NodeRedNodeForm
        :node="localNode"
        :schema="schema"
        :errors="errors"
        style="width: 100%"
      />
    </div>

    <!-- 2. Ports Settings -->
    <div v-if="showPortsSettings" class="nrg-section">
      <div class="nrg-section-title">
        {{ resolveLabel("sections.portsSettings", "Ports Settings") }}
      </div>

      <!-- Input — a single Validate Data row, rendered as a table so it matches
           the Outputs / Lifecycle Output Ports sections (muted headers) instead
           of a bright toggle label that outweighs the section title. -->
      <div v-if="features.hasInput" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{ resolveLabel("sections.input", "Input") }}
        </div>
        <table class="nrg-input">
          <thead>
            <tr>
              <th class="nrg-outputs-label">
                {{ resolveLabel("outputs.label", "Label") }}
              </th>
              <th class="nrg-outputs-flag">
                {{ resolveLabel("toggles.validateInput", "Validate Data") }}
              </th>
              <th v-if="acceptsInputSchema" class="nrg-outputs-flag">
                {{ resolveLabel("outputs.schema", "Schema") }}
              </th>
              <th
                v-if="typeCheckEnabled && supportsInputTypeValidation"
                class="nrg-outputs-flag"
              >
                {{
                  resolveLabel("toggles.validateInputTypes", "Validate Types")
                }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="nrg-outputs-label">{{ inputLabel }}</td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.validateInput"
                  :aria-label="
                    resolveLabel('toggles.validateInput', 'Validate Data')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.validateInput = val;
                    }
                  "
                />
              </td>
              <td v-if="acceptsInputSchema" class="nrg-outputs-flag">
                <button
                  type="button"
                  class="red-ui-button red-ui-button-small nrg-outputs-schema-btn"
                  :class="{
                    'nrg-schema-btn-error': !!errors['node.inputSchema'],
                  }"
                  :disabled="!localNode.validateInput"
                  :aria-label="`${resolveLabel('outputs.schema', 'Schema')} — ${inputLabel}`"
                  @click="openInputSchemaEditor()"
                >
                  <span class="nrg-schema-glyph" aria-hidden="true">
                    <svg viewBox="0 0 256 220">
                      <use href="#nrg-json-schema-logo" />
                    </svg>
                  </span>
                </button>
              </td>
              <td
                v-if="typeCheckEnabled && supportsInputTypeValidation"
                class="nrg-outputs-flag"
              >
                <NodeRedToggle
                  :model-value="localNode.validateInputTypes"
                  :aria-label="
                    resolveLabel('toggles.validateInputTypes', 'Validate Types')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.validateInputTypes = val;
                    }
                  "
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="errors['node.inputSchema']"
          class="node-red-vue-input-error-message nrg-schema-error"
          role="alert"
        >
          {{ inputLabel }} schema — {{ errors["node.inputSchema"] }}
        </div>
        <ul class="nrg-help-list">
          <li>
            <strong>{{
              resolveLabel("toggles.validateInput", "Validate Data")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateInput",
                "Validate incoming messages against the input schema before input() runs.",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#input-schema')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="typeCheckEnabled && supportsInputTypeValidation">
            <strong>{{
              resolveLabel("toggles.validateInputTypes", "Validate Types")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateInputTypes",
                "Type-check wires connected to this input on deploy (TypeScript).",
              )
            }}
          </li>
        </ul>
      </div>

      <!-- Outputs -->
      <div v-if="showOutputs" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{ resolveLabel("sections.outputs", "Outputs") }}
        </div>
        <table class="nrg-outputs">
          <thead>
            <tr>
              <th class="nrg-outputs-index">
                {{ resolveLabel("outputs.port", "Port") }}
              </th>
              <th class="nrg-outputs-label">
                {{ resolveLabel("outputs.label", "Label") }}
              </th>
              <th v-if="hasOutputValidation" class="nrg-outputs-flag">
                {{ resolveLabel("outputs.validate", "Validate Data") }}
              </th>
              <th v-if="hasOutputSchemas" class="nrg-outputs-flag">
                {{ resolveLabel("outputs.schema", "Schema") }}
              </th>
              <th
                v-if="typeCheckEnabled && supportsOutputTypeValidation"
                class="nrg-outputs-flag"
              >
                {{ resolveLabel("outputs.validateTypes", "Validate Types") }}
              </th>
              <th
                v-if="hasOutputReturnProperties"
                class="nrg-outputs-return-col"
              >
                {{ resolveLabel("outputs.returnProperty", "Return Property") }}
              </th>
              <th v-if="hasOutputContextModes" class="nrg-outputs-context-col">
                {{ resolveLabel("outputs.contextMode", "Context Mode") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="port in outputRows" :key="port.index">
              <td class="nrg-outputs-index">{{ port.index }}</td>
              <td class="nrg-outputs-label">{{ port.label }}</td>
              <td v-if="hasOutputValidation" class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="validateOutputFor(port.index)"
                  :aria-label="`${resolveLabel('outputs.validate', 'Validate Data')} — ${port.label}`"
                  @update:model-value="
                    (val: boolean) => setValidateOutput(port.index, val)
                  "
                />
              </td>
              <td v-if="hasOutputSchemas" class="nrg-outputs-flag">
                <button
                  type="button"
                  class="red-ui-button red-ui-button-small nrg-outputs-schema-btn"
                  :class="{
                    'nrg-schema-btn-error':
                      !!errors[`node.outputSchemas.${port.index}`],
                  }"
                  :disabled="!validateOutputFor(port.index)"
                  :aria-label="`${resolveLabel('outputs.schema', 'Schema')} — ${port.label}`"
                  @click="openOutputSchemaEditor(port.index)"
                >
                  <span class="nrg-schema-glyph" aria-hidden="true">
                    <svg viewBox="0 0 256 220">
                      <use href="#nrg-json-schema-logo" />
                    </svg>
                  </span>
                </button>
              </td>
              <td
                v-if="typeCheckEnabled && supportsOutputTypeValidation"
                class="nrg-outputs-flag"
              >
                <NodeRedToggle
                  :model-value="validateOutputTypesFor(port.index)"
                  :aria-label="`${resolveLabel('outputs.validateTypes', 'Validate Types')} — ${port.label}`"
                  @update:model-value="
                    (val: boolean) => setValidateOutputTypes(port.index, val)
                  "
                />
              </td>
              <td
                v-if="hasOutputReturnProperties"
                class="nrg-outputs-return-col"
              >
                <input
                  type="text"
                  class="nrg-outputs-return"
                  placeholder="output"
                  :value="returnPropertyFor(port.index)"
                  @input="
                    (e) =>
                      setReturnProperty(
                        port.index,
                        (e.target as HTMLInputElement).value,
                      )
                  "
                />
              </td>
              <td v-if="hasOutputContextModes" class="nrg-outputs-context-col">
                <select
                  class="nrg-outputs-context"
                  :value="contextModeFor(port.index)"
                  @change="
                    (e) =>
                      setContextMode(
                        port.index,
                        (e.target as HTMLSelectElement).value,
                      )
                  "
                >
                  <option
                    v-for="opt in contextModeOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-for="e in outputSchemaErrors"
          :key="`out-schema-err-${e.index}`"
          class="node-red-vue-input-error-message nrg-schema-error"
          role="alert"
        >
          {{ e.label }} schema — {{ e.message }}
        </div>
        <ul class="nrg-help-list">
          <li>
            <strong>{{
              resolveLabel("outputs.validate", "Validate Data")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateData",
                "Check the sent value against this port's schema before it is emitted.",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#output-schema')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="typeCheckEnabled && supportsOutputTypeValidation">
            <strong>{{
              resolveLabel("outputs.validateTypes", "Validate Types")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateTypes",
                "Type-check wires from this port on deploy (TypeScript).",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#output-schema')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="hasOutputReturnProperties">
            <strong>{{
              resolveLabel("outputs.returnProperty", "Return Property")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.returnProperty",
                "The message property the sent value is placed on (default: output).",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#overriding-the-return-key')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="hasOutputContextModes">
            <strong>{{
              resolveLabel("outputs.contextMode", "Context Mode")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.contextMode",
                "How the incoming message is carried to this port: carry, trace, or reset.",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#context-modes')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
        </ul>
      </div>

      <!-- Lifecycle ports: extra output ports, a subsection of Ports Settings -->
      <div v-if="hasBuiltinPorts" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{
            resolveLabel("sections.lifecyclePorts", "Lifecycle Output Ports")
          }}
        </div>
        <div class="nrg-help">
          {{
            resolveLabel(
              "help.lifecyclePorts",
              "Optional extra output ports that fire on error, on completion, and on every status change.",
            )
          }}
          <a
            class="nrg-help-link"
            :href="docsUrl('/guide/creating-a-node#lifecycle-output-ports')"
            target="_blank"
            rel="noopener noreferrer"
            >{{ resolveLabel("help.learnMore", "Learn more") }}</a
          >
        </div>
        <table class="nrg-lifecycle">
          <thead>
            <tr>
              <th class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.port", "Port") }}
              </th>
              <th class="nrg-outputs-flag">
                {{ resolveLabel("lifecyclePorts.enable", "Enable") }}
              </th>
              <th class="nrg-lifecycle-desc">
                {{ resolveLabel("lifecyclePorts.description", "Description") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="hasErrorPort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.error.name", "Error") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.errorPort"
                  :aria-label="resolveLabel('toggles.errorPort', 'Error Port')"
                  @update:model-value="
                    (val: boolean) => {
                      localNode.errorPort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.error.description",
                    "Routes the message to a separate output when this node fails, so you can handle errors on their own wire.",
                  )
                }}
              </td>
            </tr>
            <tr v-if="hasCompletePort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.complete.name", "Complete") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.completePort"
                  :aria-label="
                    resolveLabel('toggles.completePort', 'Complete Port')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.completePort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.complete.description",
                    "Emits a message from a separate output once this node finishes, so you can trigger what comes next.",
                  )
                }}
              </td>
            </tr>
            <tr v-if="hasStatusPort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.status.name", "Status") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.statusPort"
                  :aria-label="
                    resolveLabel('toggles.statusPort', 'Status Port')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.statusPort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.status.description",
                    "Emits a message from a separate output whenever this node's status changes, so your flow can react.",
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { type JSONSchemaType } from "ajv";
import type { PropType } from "vue";
import { defineComponent, shallowRef } from "vue";
import { debounce } from "es-toolkit";
import { validateForm, validateSchemaString } from "../validation";
import { typeCheckEnabled } from "../wire-check/availability";
import type { NodeFeatures, NodeRedNode } from "../types";
// Framework-internal: the built-in schema fields' editor tray. Registered
// locally (NOT globally) — only this form uses it.
import NodeRedSchemaTray from "./components/node-red-schema-tray.vue";

export default defineComponent({
  name: "NodeRedVueApp",
  components: { NodeRedSchemaTray },
  provide() {
    return {
      __nrg_form_node: this.localNode,
      __nrg_form_schema: this.schema,
      __nrg_form_errors: this.errors,
    };
  },
  props: {
    node: {
      type: Object as PropType<NodeRedNode>,
      required: true,
    },
    schema: {
      type: Object as PropType<JSONSchemaType<any>>,
      required: true,
    },
    features: {
      type: Object as PropType<NodeFeatures>,
      required: true,
    },
  },
  setup() {
    return {
      debouncedValidate: shallowRef<
        (((...args: any[]) => void) & { cancel?: () => void }) | null
      >(null),
      // Reactive: the Validate Types controls render only when the type-check
      // plugin is installed and enabled (unwrapped for the template).
      typeCheckEnabled,
    };
  },
  data() {
    return {
      localNode: this.node,
      errors: {} as Record<string, string>,
    };
  },
  computed: {
    hasOutputReturnProperties(): boolean {
      return this.schema?.properties?.outputReturnProperties !== undefined;
    },
    hasOutputContextModes(): boolean {
      return this.schema?.properties?.outputContextModes !== undefined;
    },
    /**
     * Whether THIS node offers input/output type-checking. The build injects the
     * `validateInputTypes` / `validateOutputTypes` default only for nodes with a
     * typed input / typed outputs, so its presence on the node definition is the
     * node's opt-in. The Validate Types column renders only when the node offers
     * it AND the type-check plugin is installed ({@link typeCheckEnabled}).
     */
    supportsInputTypeValidation(): boolean {
      return this.node._def?.defaults?.validateInputTypes !== undefined;
    },
    supportsOutputTypeValidation(): boolean {
      return this.node._def?.defaults?.validateOutputTypes !== undefined;
    },
    /**
     * The node author's per-port context-mode defaults, declared in the schema.
     * A port present here is configurable (its dropdown is enabled and seeded to
     * this value); a port absent here is locked to `carry`.
     */
    authorContextModeDefaults(): Record<number, string> {
      return this.schema?.properties?.outputContextModes?.default ?? {};
    },
    /**
     * Whether this node accepts per-port output DATA-VALIDATION schema overrides
     * — true when its config schema declares `outputSchemas`. Renders the Schema
     * column; a port is editable only when it has an author default (see
     * {@link authorOutputSchemaDefaults}) AND its Validate Data toggle is on.
     */
    hasOutputSchemas(): boolean {
      return this.schema?.properties?.outputSchemas !== undefined;
    },
    authorOutputSchemaDefaults(): Record<number, string> {
      return this.schema?.properties?.outputSchemas?.default ?? {};
    },
    /** Whether this node accepts an input DATA-VALIDATION schema override — true
     * when its config schema declares `inputSchema`. Renders the input Schema
     * button (enabled when the input's Validate Data toggle is on). */
    acceptsInputSchema(): boolean {
      return this.schema?.properties?.inputSchema !== undefined;
    },
    hasErrorPort(): boolean {
      return this.schema?.properties?.errorPort !== undefined;
    },
    hasCompletePort(): boolean {
      return this.schema?.properties?.completePort !== undefined;
    },
    hasStatusPort(): boolean {
      return this.schema?.properties?.statusPort !== undefined;
    },
    hasBuiltinPorts(): boolean {
      return this.hasErrorPort || this.hasCompletePort || this.hasStatusPort;
    },
    /**
     * The Validate Data column / per-port Schema button. The framework merges
     * `outputSchemas` into every IONode, so this is true whenever the node has
     * output ports — data validation is a framework control that always renders.
     */
    hasOutputValidation(): boolean {
      return this.hasOutputSchemas;
    },
    /**
     * Show the Outputs subsection whenever the node has output ports (topology
     * from its TYPES). The framework injects every per-port control (Validate
     * Data, Return Property, Context Mode) into every IONode, so a node with
     * output ports always has something to configure.
     */
    showOutputs(): boolean {
      return this.outputRows.length > 0;
    },
    showPortsSettings(): boolean {
      return this.features.hasInput || this.showOutputs || this.hasBuiltinPorts;
    },
    /**
     * Base output ports to render in the Outputs table. Reactive: a node with
     * dynamic outputs updates `localNode.outputs` (e.g. from a config field), so
     * the table grows/shrinks with it. The base count is the total minus the
     * enabled lifecycle ports; labels reuse the static `features.outputPorts`
     * when present, otherwise fall back to `Output {index}`.
     */
    outputRows(): { index: number; label: string }[] {
      const builtins =
        (this.localNode.errorPort ? 1 : 0) +
        (this.localNode.completePort ? 1 : 0) +
        (this.localNode.statusPort ? 1 : 0);
      const total =
        typeof this.localNode.outputs === "number"
          ? this.localNode.outputs
          : null;
      // Base = total minus the enabled lifecycle ports when the count is
      // consistent; otherwise fall back to the node's declared `outputs` count
      // (e.g. a flow that toggled a lifecycle port without updating `outputs`).
      const base =
        total !== null && total >= builtins
          ? total - builtins
          : this.features.outputPorts.length;
      return Array.from({ length: base }, (_, index) => ({
        index,
        label: this.features.outputPorts[index]?.label ?? `Output ${index}`,
      }));
    },
    /**
     * Flow-author output-schema validation errors, collected for display BELOW
     * the Outputs table (keyed like every other form error). Each entry pairs
     * the port label with its message so the reader knows which port is wrong.
     */
    outputSchemaErrors(): { index: number; label: string; message: string }[] {
      return this.outputRows
        .map((port) => ({
          index: port.index,
          label: port.label,
          message: this.errors[`node.outputSchemas.${port.index}`],
        }))
        .filter((e): e is { index: number; label: string; message: string } =>
          Boolean(e.message),
        );
    },
    /**
     * Label for the single input port, resolved from the node's i18n catalog
     * (`inputLabels.0`, then `inputLabels`) — mirrors createDefaultInputLabels.
     * Falls back to "Input" since there is only ever one input port.
     */
    inputLabel(): string {
      return (
        this.resolveLabel("inputLabels.0", "") ||
        this.resolveLabel("inputLabels", "Input")
      );
    },
    contextModeOptions(): { value: string; label: string }[] {
      return [
        {
          value: "carry",
          label: this.resolveLabel("contextModes.modes.carry", "carry"),
        },
        {
          value: "trace",
          label: this.resolveLabel("contextModes.modes.trace", "trace"),
        },
        {
          value: "reset",
          label: this.resolveLabel("contextModes.modes.reset", "reset"),
        },
      ];
    },
  },
  created() {
    // Debounce validation so rapid keystrokes don't trigger AJV on every
    // character. 150ms is fast enough to feel instant while batching bursts.
    this.debouncedValidate = debounce(() => this.validate(), 150);
  },
  beforeMount() {
    // Per-port output maps: give each node its own objects (the injected
    // defaults may be shared {} references) so edits don't leak across nodes.
    // Clone whichever maps the node actually declares — not gated on a runtime
    // `outputsSchema`, since a types-first node can declare `outputContextModes`
    // / `outputReturnProperties` (etc.) with no output schema at all.
    for (const key of [
      "validateOutputs",
      "validateOutputTypes",
      "outputContextModes",
      "outputReturnProperties",
      "outputSchemas",
    ] as const) {
      const existing = this.localNode[key];
      if (existing && typeof existing === "object") {
        this.localNode[key] = { ...existing };
      }
    }

    // Normalize array-typed properties to actual arrays. Nodes saved with an
    // older version of the code may have stored array values as comma-separated
    // strings; this ensures validation and future saves always see real arrays.
    if (this.schema?.properties) {
      for (const [prop, propSchema] of Object.entries(this.schema.properties)) {
        if (
          (propSchema as any).type === "array" &&
          !Array.isArray(this.localNode[prop])
        ) {
          const val = this.localNode[prop];
          this.localNode[prop] = val
            ? String(val).split(",").filter(Boolean)
            : [];
        }
      }
    }

    // Set __PWD__ for password fields whose value is missing (server has it
    // but didn't send it). If the value is still present (e.g. not yet
    // deployed), keep it so the form can validate and display it.
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials[`has_${prop}`] &&
          !this.localNode.credentials[prop]
        ) {
          this.localNode.credentials[prop] = "__PWD__";
        }
      });
    }

    // Run initial validation synchronously (no debounce) so the form opens
    // with errors already visible.
    this.validate();

    if (this.localNode._def.defaults) {
      Object.keys(this.localNode._def.defaults).forEach((prop) => {
        this.$watch(
          () => this.localNode[prop],
          () => {
            this.debouncedValidate?.();
          },
          { deep: true },
        );
      });
    }

    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        this.$watch(
          () => this.localNode.credentials[prop],
          (newVal: any, oldVal: any) => {
            this.debouncedValidate?.();

            if (
              this.localNode._def.credentials[prop].type === "password" &&
              newVal !== oldVal
            ) {
              this.localNode.credentials[`has_${prop}`] = !!newVal;
            }
          },
          { deep: true },
        );
      });
    }
  },
  beforeUnmount() {
    // Cancel any pending debounced validation so it doesn't fire after unmount.
    this.debouncedValidate?.cancel?.();

    // NOTE: must set credentials prop to undefined to avoid updating it to __PWD__ in the server
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials?.[`has_${prop}`] &&
          this.localNode.credentials?.[prop] === "__PWD__"
        ) {
          this.localNode.credentials[prop] = undefined;
        }
      });
    }
  },
  methods: {
    validate() {
      const newErrors = validateForm(this.localNode, this.schema);
      Object.assign(newErrors, this.schemaStringErrors());
      const keys = Object.keys(this.errors);
      for (let i = 0; i < keys.length; i++) delete this.errors[keys[i]];
      Object.assign(this.errors, newErrors);
    },
    /**
     * Validates the flow-author per-port DATA-VALIDATION schema STRINGS (the
     * input schema and each output-port schema) so a malformed JSON Schema is
     * caught here in the editor rather than at deploy time, when `input()` /
     * `send()` first compile it. Only ports whose Validate Data toggle is on are
     * checked, since only those compile at runtime. Errors are keyed like every
     * other form error (`node.inputSchema`, `node.outputSchemas.<i>`) so the
     * message renders inline and the Schema icon turns red.
     */
    schemaStringErrors(): Record<string, string> {
      const errs: Record<string, string> = {};
      if (this.acceptsInputSchema && this.localNode.validateInput) {
        const msg = validateSchemaString(this.inputSchemaValue());
        if (msg) errs["node.inputSchema"] = msg;
      }
      if (this.hasOutputSchemas) {
        for (const { index } of this.outputRows) {
          if (!this.validateOutputFor(index)) continue;
          const msg = validateSchemaString(this.outputSchemaFor(index));
          if (msg) errs[`node.outputSchemas.${index}`] = msg;
        }
      }
      return errs;
    },
    resolveLabel(key: string, fallback: string): string {
      const resolved = this.$i18n(key);
      const fullKey = `${this.localNode.type}.${key}`;
      if (resolved && resolved !== fullKey && resolved !== key) {
        return resolved;
      }
      return fallback;
    },
    docsUrl(path: string): string {
      return `https://bonsaedev.github.io/nrg${path}`;
    },
    recalculateOutputs() {
      const baseOutputs = this.localNode._def?.outputs ?? 0;
      let count = baseOutputs;
      if (this.localNode.errorPort) count++;
      if (this.localNode.completePort) count++;
      if (this.localNode.statusPort) count++;
      this.localNode.outputs = count;
    },
    validateOutputFor(index: number): boolean {
      return this.localNode.validateOutputs?.[index] ?? false;
    },
    setValidateOutput(index: number, checked: boolean) {
      this.localNode.validateOutputs = {
        ...(this.localNode.validateOutputs ?? {}),
        [index]: checked,
      };
    },
    validateOutputTypesFor(index: number): boolean {
      return this.localNode.validateOutputTypes?.[index] ?? false;
    },
    setValidateOutputTypes(index: number, checked: boolean) {
      this.localNode.validateOutputTypes = {
        ...(this.localNode.validateOutputTypes ?? {}),
        [index]: checked,
      };
    },
    returnPropertyFor(index: number): string {
      return this.localNode.outputReturnProperties?.[index] ?? "";
    },
    setReturnProperty(index: number, value: string) {
      const next = { ...(this.localNode.outputReturnProperties ?? {}) };
      if (value.trim()) {
        next[index] = value;
      } else {
        delete next[index];
      }
      this.localNode.outputReturnProperties = next;
    },
    /** The mode shown for a port: the flow author's saved choice, else the node
     * author's declared default, else `carry`. Every port's dropdown is always
     * editable — the flow author can pick any mode regardless of declaration. */
    contextModeFor(index: number): string {
      return (
        this.localNode.outputContextModes?.[index] ??
        this.authorContextModeDefaults[index] ??
        "carry"
      );
    },
    setContextMode(index: number, value: string) {
      this.localNode.outputContextModes = {
        ...(this.localNode.outputContextModes ?? {}),
        [index]: value,
      };
    },
    /** The effective schema string for a port: the flow-author override, else the
     * author default, else empty. */
    outputSchemaFor(index: number): string {
      return (
        this.localNode.outputSchemas?.[index] ??
        this.authorOutputSchemaDefaults[index] ??
        ""
      );
    },
    setOutputSchema(index: number, value: string) {
      const next = { ...(this.localNode.outputSchemas ?? {}) };
      if (value.trim()) {
        next[index] = value;
      } else {
        delete next[index];
      }
      this.localNode.outputSchemas = next;
    },
    /** Open a Monaco (JSON) tray to edit this port's validation schema, seeded
     * from the effective value and saved back to config on Done. */
    /** The Vue schema-editor tray component (globally registered), typed. */
    schemaTrayRef(): {
      open(title: string, value: string, onSave: (value: string) => void): void;
    } {
      return this.$refs.schemaTray as {
        open(
          title: string,
          value: string,
          onSave: (value: string) => void,
        ): void;
      };
    },
    openOutputSchemaEditor(index: number) {
      const title = `${this.resolveLabel("outputs.schema", "Schema")} — ${
        this.outputRows[index]?.label ?? `Output ${index}`
      }`;
      this.schemaTrayRef().open(title, this.outputSchemaFor(index), (value) =>
        this.setOutputSchema(index, value),
      );
    },
    /** The effective input schema string: the flow-author override, else the
     * author default, else empty. */
    inputSchemaValue(): string {
      return (
        this.localNode.inputSchema ??
        this.schema?.properties?.inputSchema?.default ??
        ""
      );
    },
    setInputSchema(value: string) {
      this.localNode.inputSchema = value.trim();
    },
    /** Open a Monaco (JSON) tray to edit the input's validation schema, seeded
     * from the effective value and saved back to config on Done. */
    openInputSchemaEditor() {
      const title = `${this.resolveLabel("outputs.schema", "Schema")} — ${
        this.inputLabel
      }`;
      this.schemaTrayRef().open(title, this.inputSchemaValue(), (value) =>
        this.setInputSchema(value),
      );
    },
  },
});
</script>

<style scoped>
/* Root wrapper guarantees breathing room below the last section so it never
   butts against the edit tray's bottom edge, regardless of which section ends
   the form. */
.nrg-form-app {
  padding-bottom: 16px;
}

/* Lifecycle ports reuse the .nrg-outputs table chrome; PORT/ENABLE size to
   content (nowrap) and DESCRIPTION stays on one line — see the table-layout
   override below. */
.nrg-lifecycle-port {
  white-space: nowrap;
}

/* Left-align the description (overrides the shared centered cell rule, which
   out-specifies a bare class) and keep it — with its Learn more link — on one
   line. Header stays centered like the others. */
.nrg-lifecycle td.nrg-lifecycle-desc {
  text-align: left;
  white-space: nowrap;
  color: var(--red-ui-text-color-disabled, #999);
}

/* Per-column explanations below the input/outputs tables (replaces the old
   per-row Description column — one dash item per column that takes user input). */
.nrg-help-list {
  margin: 4px 0 6px;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--red-ui-text-color-disabled, #999);
}

.nrg-help-list li {
  margin: 1px 0;
}

.nrg-section {
  border-top: 1px solid var(--red-ui-secondary-border-color, #ddd);
  margin-top: 12px;
  padding-top: 8px;
}

.nrg-section-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 8px;
}

.nrg-help {
  /* No width cap: each help sentence lays out on a single line and contributes
     its natural width to the form, so Node-RED sizes the edit tray wide enough
     to show it unwrapped (alongside the no-wrap lifecycle descriptions). */
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.4;
  color: var(--red-ui-text-color-disabled, #999);
  margin: 2px 0 6px;
}

.nrg-help-link {
  color: var(--red-ui-text-color-link, #2196f3);
  white-space: nowrap;
}

.nrg-help-link:hover {
  text-decoration: underline;
}

.nrg-subsection {
  margin-bottom: 10px;
}

.nrg-subsection-title {
  font-weight: bold;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--red-ui-text-color-disabled, #777);
  margin: 6px 0 4px;
}

.nrg-outputs,
.nrg-lifecycle,
.nrg-input {
  /* Fill the panel so the table grows when the tray is widened. At the default
     tray width this is moot: with the help prose capped (see .nrg-help), the
     table's fixed column-sum is the widest intrinsic element, so Node-RED sizes
     the tray to the table. Dragging the tray wider then stretches the columns. */
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  margin-top: 6px;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--red-ui-secondary-border-color, #d9d9d9);
  border-radius: 3px;
  overflow: hidden;
  font-size: 12px;
}

/* Lifecycle table: auto layout so PORT and ENABLE shrink to their content and
   DESCRIPTION (kept on one line) drives the table's natural width — Node-RED
   then sizes the tray to fit it, so descriptions never wrap. Declared after the
   shared rule so table-layout: auto wins over the fixed default. */
.nrg-lifecycle,
.nrg-input {
  table-layout: auto;
}

/* The Input table holds just Label + Validate Data (+ Validate Types), so unlike
   the Outputs table it needn't span the panel — size it to its content. Declared
   after the shared `width: 100%` so it wins. */
.nrg-input {
  width: auto;
}

.nrg-lifecycle .nrg-outputs-flag,
.nrg-input .nrg-outputs-flag {
  width: auto;
}

.nrg-outputs th,
.nrg-outputs td,
.nrg-lifecycle th,
.nrg-lifecycle td,
.nrg-input th,
.nrg-input td {
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
  border-bottom: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
}

.nrg-outputs th:last-child,
.nrg-outputs td:last-child,
.nrg-lifecycle th:last-child,
.nrg-lifecycle td:last-child,
.nrg-input th:last-child,
.nrg-input td:last-child {
  border-right: none;
}

.nrg-outputs tbody tr:last-child td,
.nrg-lifecycle tbody tr:last-child td,
.nrg-input tbody tr:last-child td {
  border-bottom: none;
}

.nrg-outputs thead th,
.nrg-lifecycle thead th,
.nrg-input thead th {
  background: var(--red-ui-tertiary-background, #f3f3f3);
  color: var(--red-ui-text-color-disabled, #777);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.nrg-outputs-index {
  width: 3em;
}

/* Fixed Label column — long labels truncate with an ellipsis instead of
   widening the table. */
.nrg-outputs-label {
  width: 200px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sized to hold the "Return Property" / "Context Mode" headers on one line; the
   inner input/select fills the column (width: 100%). */
.nrg-outputs-return-col {
  width: 150px;
  white-space: nowrap;
}

.nrg-outputs-context-col {
  width: 130px;
  white-space: nowrap;
}

.nrg-outputs-flag {
  /* Wide enough to keep the English "Validate Data" header on one line; the
     extra width is taken from the auto columns (mostly the roomy Label column).
     No nowrap: longer localized headers wrap to two lines instead of clipping
     under table-layout:fixed + overflow:hidden. */
  width: 116px;
}

/* Center the toggle in the cell. Block-level `flex` (not the component's default
   inline-flex) so the cell's `vertical-align: middle` centers it on the row's
   true center, not the text x-height — otherwise the toggle sits slightly high
   relative to the return-property input / context-mode select in the same row. */
.nrg-outputs-flag .nrg-toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The Schema button shows the official JSON Schema logo (inlined <svg><use>).
   The path is `fill="currentColor"`, so `color` here drives it — official blue
   normally, red when the schema is invalid. */
.nrg-json-schema-logo-defs {
  position: absolute;
  width: 0;
  height: 0;
}
/* Center the logo in the button (an icon-only button; flex avoids the inline
   baseline offset). */
.nrg-outputs-schema-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.nrg-outputs-schema-btn .nrg-schema-glyph {
  display: inline-flex;
  align-items: center;
  line-height: 0;
  /* No color set: `currentColor` inherits the Node-RED button font color. The
     error rule below overrides it to red. */
}
.nrg-outputs-schema-btn .nrg-schema-glyph svg {
  display: block;
  height: 14px;
  width: auto;
}

/* Invalid flow-author schema: redden the logo and border so the mistake is
   visible on the button without opening the tray. */
.nrg-outputs-schema-btn.nrg-schema-btn-error {
  border-color: var(--red-ui-text-color-error, #d33);
}
.nrg-outputs-schema-btn.nrg-schema-btn-error .nrg-schema-glyph {
  color: var(--red-ui-text-color-error, #d33);
}

/* The schema error message renders below the ports table, one line per port. */
.nrg-schema-error {
  display: block;
  margin-top: 6px;
}

/* Keep column headers (notably "Validate Data") on a single line. */
.nrg-input thead th,
.nrg-outputs thead th {
  white-space: nowrap;
}

.nrg-outputs-return {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  padding: 0 6px;
  text-align: left;
  border: 1px solid
    var(
      --red-ui-form-input-border-color,
      var(--red-ui-secondary-border-color, #ccc)
    );
  border-radius: 2px;
  background: var(--red-ui-form-input-background, #fff);
  color: var(--red-ui-form-text-color, inherit);
}

.nrg-outputs-context {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  padding: 0 6px;
  text-align: center;
  border: 1px solid
    var(
      --red-ui-form-input-border-color,
      var(--red-ui-secondary-border-color, #ccc)
    );
  border-radius: 2px;
  background: var(--red-ui-form-input-background, #fff);
  color: var(--red-ui-form-text-color, inherit);
}

.nrg-outputs-context:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Node-RED's global rules force input[type=text] (and select) to 34px with
   their own padding/margin and beat a single scoped class. Re-assert ours at
   higher specificity (.nrg-outputs td .x → wins over .red-ui-editor
   input[type=text]) so the return-property input and context-mode select share
   one height and line up in the row. */
.nrg-outputs td .nrg-outputs-return,
.nrg-outputs td .nrg-outputs-context {
  height: 28px;
  margin: 0;
  padding: 0 6px;
  line-height: normal;
}

:deep(.node-red-vue-input-error-message) {
  color: var(--red-ui-text-color-error);
}

:deep(.form-row input[type="text"]),
:deep(.form-row input[type="number"]),
:deep(.form-row input[type="password"]) {
  height: 34px;
  padding: 0 8px;
  box-sizing: border-box;
}
</style>
