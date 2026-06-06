import fs from "fs";
import path from "path";
import type { Page, Locator } from "playwright";

export class NodeRedEditor {
  readonly errors: string[] = [];
  private screenshotDir: string;

  constructor(
    readonly page: Page,
    readonly port: number,
    options?: { screenshotDir?: string },
  ) {
    this.screenshotDir = options?.screenshotDir ?? "test-results/screenshots";
    page.on("pageerror", (err) => this.errors.push(err.message));
  }

  async screenshot(name: string): Promise<string> {
    fs.mkdirSync(this.screenshotDir, { recursive: true });
    const filePath = path.join(this.screenshotDir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async open(): Promise<void> {
    await this.page.goto(`http://localhost:${this.port}`);
    await this.page.waitForSelector("#red-ui-workspace", { timeout: 30_000 });
    await this.page.waitForFunction(
      () => {
        const r = (globalThis as Record<string, unknown>).RED as any;
        return r && typeof r.editor?.edit === "function";
      },
      { timeout: 15_000 },
    );
  }

  async deployFlow(flow: Record<string, unknown>[]): Promise<void> {
    const res = await fetch(`http://localhost:${this.port}/flows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Node-RED-Deployment-Type": "full",
      },
      body: JSON.stringify(flow),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to deploy flow: ${res.status} ${await res.text()}`,
      );
    }
    await this.page.reload();
    await this.page.waitForSelector("#red-ui-workspace", { timeout: 15_000 });
  }

  async editNode(nodeId: string): Promise<void> {
    await this.page.waitForFunction(
      (id) => {
        const r = (globalThis as Record<string, unknown>).RED as any;
        const node = r?.nodes?.node(id);
        if (!node) return false;
        return r.nodes.getType(node.type) !== null;
      },
      nodeId,
      { timeout: 15_000 },
    );
    await this.page.evaluate((id) => {
      const r = (globalThis as Record<string, unknown>).RED as any;
      r.editor.edit(r.nodes.node(id));
    }, nodeId);
    await this.page.waitForSelector(".red-ui-tray", { timeout: 10_000 });
    await this.page.waitForTimeout(500);
  }

  async clickDone(): Promise<void> {
    await this.page.evaluate(() => {
      (globalThis as any).document.getElementById("node-dialog-ok")!.click();
    });
    await this.page.waitForSelector(".red-ui-tray", {
      state: "hidden",
      timeout: 5_000,
    });
  }

  async clickCancel(): Promise<void> {
    await this.page.evaluate(() => {
      (globalThis as any).document
        .getElementById("node-dialog-cancel")!
        .click();
    });
    await this.page.waitForSelector(".red-ui-tray", {
      state: "hidden",
      timeout: 5_000,
    });
  }

  field(label: string): NodeRedField {
    return new NodeRedField(this.page, label);
  }

  get tray(): Locator {
    return this.page.locator(".red-ui-tray-body-wrapper");
  }
}

export class NodeRedField {
  readonly row: Locator;

  constructor(
    private readonly page: Page,
    readonly label: string,
  ) {
    this.row = page.locator(`.form-row:has(:text("${label}"))`).first();
  }

  get input(): Locator {
    return this.row.locator("input").first();
  }

  async fill(value: string): Promise<void> {
    await this.input.fill(value, { force: true });
  }

  async clear(): Promise<void> {
    await this.input.fill("", { force: true });
  }

  get toggleSlider(): Locator {
    return this.row.locator(".nrg-toggle__slider");
  }

  get toggleCheckbox(): Locator {
    return this.row.locator('input[type="checkbox"]');
  }

  async toggle(): Promise<void> {
    await this.toggleSlider.click();
  }

  get checkbox(): Locator {
    return this.row.locator('input[type="checkbox"]');
  }

  get selectInput(): Locator {
    return this.row.locator("input.node-input-select");
  }

  get typedInput(): Locator {
    return this.row.locator("input.node-red-typed-input");
  }

  get typedInputButton(): Locator {
    return this.row.locator(
      ".red-ui-typedInput-container .red-ui-typedInput-type-select",
    );
  }

  get configSelect(): Locator {
    return this.row.locator("select, input").first();
  }

  get editorWrapper(): Locator {
    return this.row.locator(".editor-wrapper");
  }

  get expandButton(): Locator {
    return this.row.locator(".expand-button");
  }

  get errorMessage(): Locator {
    return this.row.locator(".node-red-vue-input-error-message");
  }

  async scrollIntoView(): Promise<void> {
    await this.row.scrollIntoViewIfNeeded();
  }

  async expectVisible(): Promise<void> {
    await this.row.waitFor({ state: "visible", timeout: 5_000 });
  }

  async expectHidden(): Promise<void> {
    await this.row.waitFor({ state: "hidden", timeout: 5_000 });
  }
}
