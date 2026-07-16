<template>
  <!-- Lifecycle ports: extra output ports, a subsection of Ports Settings -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{ resolveLabel("sections.lifecyclePorts", "Lifecycle Output Ports") }}
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
          <th class="nrg-cell-flag">
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
          <td class="nrg-cell-flag">
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
          <td class="nrg-cell-flag">
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
          <td class="nrg-cell-flag">
            <NodeRedToggle
              :model-value="localNode.statusPort"
              :aria-label="resolveLabel('toggles.statusPort', 'Status Port')"
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
</template>

<script setup lang="ts">
import { usePortsSettings } from "../../../composables/use-ports-settings";

const {
  localNode,
  hasErrorPort,
  hasCompletePort,
  hasStatusPort,
  resolveLabel,
  docsUrl,
  recalculateOutputs,
} = usePortsSettings();
</script>

<style scoped>
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
</style>
