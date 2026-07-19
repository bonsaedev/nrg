<template>
  <!-- Lifecycle ports: extra output ports, a subsection of Ports Settings -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{
        resolveLabel(
          "portSettings.lifecyclePortsTable.section",
          "Lifecycle Output Ports",
        )
      }}
    </div>
    <div class="nrg-help">
      {{
        resolveLabel(
          "portSettings.lifecyclePortsTable.help",
          "Optional extra output ports that fire on error, on completion, and on every status change.",
        )
      }}
      <a
        class="nrg-help-link"
        :href="docsUrl('/guide/creating-a-node#lifecycle-output-ports')"
        target="_blank"
        rel="noopener noreferrer"
        >{{
          resolveLabel(
            "portSettings.lifecyclePortsTable.learnMore",
            "Learn more",
          )
        }}</a
      >
    </div>
    <div class="nrg-table-scroll">
      <table class="nrg-lifecycle">
        <thead>
          <tr>
            <th class="nrg-cell-label">
              {{
                resolveLabel("portSettings.lifecyclePortsTable.label", "Label")
              }}
            </th>
            <th class="nrg-cell-flag">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.enable",
                  "Enable",
                )
              }}
            </th>
            <th class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.description",
                  "Description",
                )
              }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="hasErrorPort">
            <td class="nrg-cell-label">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.error.name",
                  "Error",
                )
              }}
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
            <td class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.error.description",
                  "Routes the message to a separate output when this node throws (an unexpected failure), so you can handle it on its own wire.",
                )
              }}
            </td>
          </tr>
          <tr v-if="hasCompletePort">
            <td class="nrg-cell-label">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.complete.name",
                  "Complete",
                )
              }}
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
            <td class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.complete.description",
                  "Emits a message from a separate output once this node finishes, so you can trigger what comes next.",
                )
              }}
            </td>
          </tr>
          <tr v-if="hasStatusPort">
            <td class="nrg-cell-label">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.status.name",
                  "Status",
                )
              }}
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
            <td class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.lifecyclePortsTable.status.description",
                  "Emits a message from a separate output whenever this node's status changes, so your flow can react.",
                )
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
/* The lifecycle table shares the .nrg-table-scroll box and the
   .nrg-cell-label / .nrg-cell-flag / .nrg-cell-desc chrome with the Input and
   Outputs tables (see ports-settings.vue) — auto layout, single-line
   descriptions, horizontal scroll. */
.nrg-help {
  font-size: 11px;
  line-height: 1.4;
  color: var(--red-ui-text-color-disabled, #999);
  margin: 2px 0 6px;
}
</style>
