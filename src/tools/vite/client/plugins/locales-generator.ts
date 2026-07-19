import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { merge } from "es-toolkit";

function localesGenerator(options: {
  outDir: string;
  docsDir: string;
  labelsDir: string;
}): Plugin {
  const { outDir, docsDir, labelsDir } = options;
  const languages = [
    "en-US",
    "de",
    "es-ES",
    "fr",
    "ko",
    "pt-BR",
    "ru",
    "ja",
    "zh-CN",
    "zh-TW",
  ];

  // Framework labels injected into every node type's locale.
  // Uses the same nested structure that Node-RED's i18next expects.
  // Users can override any key in their own label files.
  const frameworkLabels: Record<string, Record<string, unknown>> = {
    "en-US": {
      configs: { name: { label: "Name" } },
      toggles: {
        errorPort: "Error Port",
        completePort: "Complete Port",
        statusPort: "Status Port",
      },
      portSettings: {
        title: "Ports Settings",
        inputsTable: {
          section: "Input",
          label: "Label",
          validate: "Validate Data",
          schema: "Data Schema",
          description: "Description",
          help: {
            validate:
              "Validate incoming messages against the input schema before input() runs.",
            learnMore: "Learn more",
          },
        },
        outputsTable: {
          section: "Outputs",
          label: "Label",
          validate: "Validate Data",
          schema: "Data Schema",
          description: "Description",
          help: {
            validate:
              "Check the sent value against this port's schema before it is emitted.",
            learnMore: "Learn more",
          },
        },
        lifecyclePortsTable: {
          section: "Lifecycle Output Ports",
          label: "Label",
          enable: "Enable",
          description: "Description",
          help: "Optional extra output ports that fire on error, on completion, and on every status change.",
          learnMore: "Learn more",
          error: {
            name: "Error",
            description:
              "Routes the message to a separate output when this node throws (an unexpected failure), so you can handle it on its own wire.",
          },
          complete: {
            name: "Complete",
            description:
              "Emits a message from a separate output once this node finishes, so you can trigger what comes next.",
          },
          status: {
            name: "Status",
            description:
              "Emits a message from a separate output whenever this node's status changes, so your flow can react.",
          },
        },
      },
    },
    de: {
      configs: { name: { label: "Name" } },
      toggles: {
        errorPort: "Fehler-Port",
        completePort: "Abschluss-Port",
        statusPort: "Status-Port",
      },
      portSettings: {
        title: "Port-Einstellungen",
        inputsTable: {
          section: "Eingang",
          label: "Bezeichnung",
          validate: "Daten validieren",
          schema: "Datenschema",
          description: "Beschreibung",
          help: {
            validate:
              "Eingehende Nachrichten vor dem Ausführen von input() gegen das Eingabe-Schema validieren.",
            learnMore: "Mehr erfahren",
          },
        },
        outputsTable: {
          section: "Ausgänge",
          label: "Bezeichnung",
          validate: "Daten validieren",
          schema: "Datenschema",
          description: "Beschreibung",
          help: {
            validate:
              "Prüft den gesendeten Wert gegen das Schema dieses Ports, bevor er ausgegeben wird.",
            learnMore: "Mehr erfahren",
          },
        },
        lifecyclePortsTable: {
          section: "Lebenszyklus-Ausgangsports",
          label: "Bezeichnung",
          enable: "Aktivieren",
          description: "Beschreibung",
          help: "Optionale zusätzliche Ausgänge, die bei Fehler, Abschluss und jeder Statusänderung auslösen.",
          learnMore: "Mehr erfahren",
          error: {
            name: "Fehler",
            description:
              "Leitet die Nachricht an einen separaten Ausgang weiter, wenn dieser Node eine Ausnahme wirft (ein unerwarteter Fehler), sodass Sie ihn auf einer eigenen Leitung behandeln können.",
          },
          complete: {
            name: "Abschluss",
            description:
              "Sendet eine Nachricht über einen separaten Ausgang, sobald dieser Node fertig ist, damit Sie den nächsten Schritt auslösen können.",
          },
          status: {
            name: "Status",
            description:
              "Sendet eine Nachricht über einen separaten Ausgang, wann immer sich der Status dieses Nodes ändert, damit Ihr Flow darauf reagieren kann.",
          },
        },
      },
    },
    "es-ES": {
      configs: { name: { label: "Nombre" } },
      toggles: {
        errorPort: "Puerto de error",
        completePort: "Puerto de completado",
        statusPort: "Puerto de estado",
      },
      portSettings: {
        title: "Configuración de puertos",
        inputsTable: {
          section: "Entrada",
          label: "Etiqueta",
          validate: "Validar datos",
          schema: "Esquema de datos",
          description: "Descripción",
          help: {
            validate:
              "Valida los mensajes entrantes con el esquema de entrada antes de ejecutar input().",
            learnMore: "Más información",
          },
        },
        outputsTable: {
          section: "Salidas",
          label: "Etiqueta",
          validate: "Validar datos",
          schema: "Esquema de datos",
          description: "Descripción",
          help: {
            validate:
              "Comprueba el valor enviado contra el esquema de este puerto antes de emitirlo.",
            learnMore: "Más información",
          },
        },
        lifecyclePortsTable: {
          section: "Puertos de salida de ciclo de vida",
          label: "Etiqueta",
          enable: "Activar",
          description: "Descripción",
          help: "Puertos de salida adicionales opcionales que se activan en error, al completar y en cada cambio de estado.",
          learnMore: "Más información",
          error: {
            name: "Error",
            description:
              "Dirige el mensaje a una salida independiente cuando este nodo lanza una excepción (un fallo inesperado), para que puedas gestionarlo en su propio cable.",
          },
          complete: {
            name: "Completado",
            description:
              "Emite un mensaje desde una salida independiente cuando este nodo termina, para que puedas activar lo que viene después.",
          },
          status: {
            name: "Estado",
            description:
              "Emite un mensaje desde una salida independiente cada vez que cambia el estado de este nodo, para que tu flujo pueda reaccionar.",
          },
        },
      },
    },
    fr: {
      configs: { name: { label: "Nom" } },
      toggles: {
        errorPort: "Port d'erreur",
        completePort: "Port de complétion",
        statusPort: "Port de statut",
      },
      portSettings: {
        title: "Paramètres des ports",
        inputsTable: {
          section: "Entrée",
          label: "Libellé",
          validate: "Valider les données",
          schema: "Schéma de données",
          description: "Description",
          help: {
            validate:
              "Valide les messages entrants avec le schéma d'entrée avant l'exécution de input().",
            learnMore: "En savoir plus",
          },
        },
        outputsTable: {
          section: "Sorties",
          label: "Libellé",
          validate: "Valider les données",
          schema: "Schéma de données",
          description: "Description",
          help: {
            validate:
              "Vérifie la valeur envoyée par rapport au schéma de ce port avant l'émission.",
            learnMore: "En savoir plus",
          },
        },
        lifecyclePortsTable: {
          section: "Ports de sortie de cycle de vie",
          label: "Libellé",
          enable: "Activer",
          description: "Description",
          help: "Ports de sortie supplémentaires optionnels déclenchés en cas d'erreur, à la fin et à chaque changement de statut.",
          learnMore: "En savoir plus",
          error: {
            name: "Erreur",
            description:
              "Achemine le message vers une sortie distincte lorsque ce nœud lève une exception (une défaillance inattendue), pour que vous puissiez la gérer sur son propre fil.",
          },
          complete: {
            name: "Complétion",
            description:
              "Émet un message depuis une sortie distincte une fois que ce nœud a terminé, pour que vous puissiez déclencher la suite.",
          },
          status: {
            name: "Statut",
            description:
              "Émet un message depuis une sortie distincte chaque fois que le statut de ce nœud change, pour que votre flux puisse réagir.",
          },
        },
      },
    },
    ko: {
      configs: { name: { label: "이름" } },
      toggles: {
        errorPort: "오류 포트",
        completePort: "완료 포트",
        statusPort: "상태 포트",
      },
      portSettings: {
        title: "포트 설정",
        inputsTable: {
          section: "입력",
          label: "레이블",
          validate: "데이터 검증",
          schema: "데이터 스키마",
          description: "설명",
          help: {
            validate:
              "input() 실행 전에 들어오는 메시지를 입력 스키마로 검증합니다.",
            learnMore: "자세히 보기",
          },
        },
        outputsTable: {
          section: "출력",
          label: "레이블",
          validate: "데이터 검증",
          schema: "데이터 스키마",
          description: "설명",
          help: {
            validate: "값을 내보내기 전에 이 포트의 스키마에 대해 검사합니다.",
            learnMore: "자세히 보기",
          },
        },
        lifecyclePortsTable: {
          section: "수명 주기 출력 포트",
          label: "레이블",
          enable: "활성화",
          description: "설명",
          help: "오류, 완료, 모든 상태 변경 시 발생하는 선택적 추가 출력 포트입니다.",
          learnMore: "자세히 보기",
          error: {
            name: "오류",
            description:
              "이 노드가 예외를 던지면(예기치 않은 실패) 메시지를 별도의 출력으로 보내, 전용 연결선에서 처리할 수 있습니다.",
          },
          complete: {
            name: "완료",
            description:
              "이 노드가 끝나면 별도의 출력으로 메시지를 내보내, 다음 작업을 실행할 수 있습니다.",
          },
          status: {
            name: "상태",
            description:
              "이 노드의 상태가 바뀔 때마다 별도의 출력으로 메시지를 내보내, 플로우가 반응할 수 있습니다.",
          },
        },
      },
    },
    "pt-BR": {
      configs: { name: { label: "Nome" } },
      toggles: {
        errorPort: "Porta de Erro",
        completePort: "Porta de Conclusão",
        statusPort: "Porta de Status",
      },
      portSettings: {
        title: "Configurações de portas",
        inputsTable: {
          section: "Entrada",
          label: "Rótulo",
          validate: "Validar dados",
          schema: "Esquema de dados",
          description: "Descrição",
          help: {
            validate:
              "Valida as mensagens recebidas com o esquema de entrada antes de input() executar.",
            learnMore: "Saiba mais",
          },
        },
        outputsTable: {
          section: "Saídas",
          label: "Rótulo",
          validate: "Validar dados",
          schema: "Esquema de dados",
          description: "Descrição",
          help: {
            validate:
              "Verifica o valor enviado em relação ao esquema desta porta antes de emiti-lo.",
            learnMore: "Saiba mais",
          },
        },
        lifecyclePortsTable: {
          section: "Portas de saída de ciclo de vida",
          label: "Rótulo",
          enable: "Ativar",
          description: "Descrição",
          help: "Portas de saída extras opcionais que disparam em erro, na conclusão e a cada mudança de status.",
          learnMore: "Saiba mais",
          error: {
            name: "Erro",
            description:
              "Encaminha a mensagem para uma saída separada quando este nó lança uma exceção (uma falha inesperada), para que você possa tratá-la em um fio próprio.",
          },
          complete: {
            name: "Conclusão",
            description:
              "Emite uma mensagem por uma saída separada assim que este nó termina, para que você possa acionar o que vem a seguir.",
          },
          status: {
            name: "Status",
            description:
              "Emite uma mensagem por uma saída separada sempre que o status deste nó muda, para que seu fluxo possa reagir.",
          },
        },
      },
    },
    ru: {
      configs: { name: { label: "Имя" } },
      toggles: {
        errorPort: "Порт ошибки",
        completePort: "Порт завершения",
        statusPort: "Порт статуса",
      },
      portSettings: {
        title: "Настройки портов",
        inputsTable: {
          section: "Вход",
          label: "Метка",
          validate: "Проверять данные",
          schema: "Схема данных",
          description: "Описание",
          help: {
            validate:
              "Проверять входящие сообщения по схеме ввода перед вызовом input().",
            learnMore: "Подробнее",
          },
        },
        outputsTable: {
          section: "Выходы",
          label: "Метка",
          validate: "Проверять данные",
          schema: "Схема данных",
          description: "Описание",
          help: {
            validate:
              "Проверяет отправляемое значение по схеме этого порта перед отправкой.",
            learnMore: "Подробнее",
          },
        },
        lifecyclePortsTable: {
          section: "Выходные порты жизненного цикла",
          label: "Метка",
          enable: "Включить",
          description: "Описание",
          help: "Дополнительные необязательные выходные порты, срабатывающие при ошибке, завершении и каждом изменении статуса.",
          learnMore: "Подробнее",
          error: {
            name: "Ошибка",
            description:
              "Направляет сообщение на отдельный выход, когда этот узел выбрасывает исключение (непредвиденный сбой), чтобы вы могли обработать его на отдельном проводе.",
          },
          complete: {
            name: "Завершение",
            description:
              "Отправляет сообщение с отдельного выхода, как только этот узел завершает работу, чтобы вы могли запустить следующий шаг.",
          },
          status: {
            name: "Статус",
            description:
              "Отправляет сообщение с отдельного выхода каждый раз, когда меняется статус этого узла, чтобы ваш поток мог отреагировать.",
          },
        },
      },
    },
    ja: {
      configs: { name: { label: "名前" } },
      toggles: {
        errorPort: "エラーポート",
        completePort: "完了ポート",
        statusPort: "ステータスポート",
      },
      portSettings: {
        title: "ポート設定",
        inputsTable: {
          section: "入力",
          label: "ラベル",
          validate: "データを検証",
          schema: "データスキーマ",
          description: "説明",
          help: {
            validate:
              "input() の実行前に、受信メッセージを入力スキーマで検証します。",
            learnMore: "詳細",
          },
        },
        outputsTable: {
          section: "出力",
          label: "ラベル",
          validate: "データを検証",
          schema: "データスキーマ",
          description: "説明",
          help: {
            validate:
              "送信前に、送信値をこのポートのスキーマに対して検証します。",
            learnMore: "詳細",
          },
        },
        lifecyclePortsTable: {
          section: "ライフサイクル出力ポート",
          label: "ラベル",
          enable: "有効化",
          description: "説明",
          help: "エラー時・完了時・ステータス変更ごとに発火する任意の追加出力ポート。",
          learnMore: "詳細",
          error: {
            name: "エラー",
            description:
              "このノードが例外をスローした（予期しない失敗）ときにメッセージを別の出力へ送り、専用の線で処理できるようにします。",
          },
          complete: {
            name: "完了",
            description:
              "このノードが終わると別の出力からメッセージを送り、次の処理を呼び出せるようにします。",
          },
          status: {
            name: "ステータス",
            description:
              "このノードのステータスが変わるたびに別の出力からメッセージを送り、フローが反応できるようにします。",
          },
        },
      },
    },
    "zh-CN": {
      configs: { name: { label: "名称" } },
      toggles: {
        errorPort: "错误端口",
        completePort: "完成端口",
        statusPort: "状态端口",
      },
      portSettings: {
        title: "端口设置",
        inputsTable: {
          section: "输入",
          label: "标签",
          validate: "验证数据",
          schema: "数据模式",
          description: "说明",
          help: {
            validate: "在 input() 运行前，根据输入结构描述校验传入消息。",
            learnMore: "了解更多",
          },
        },
        outputsTable: {
          section: "输出",
          label: "标签",
          validate: "验证数据",
          schema: "数据模式",
          description: "说明",
          help: {
            validate: "在发送前根据此端口的模式检查发送的值。",
            learnMore: "了解更多",
          },
        },
        lifecyclePortsTable: {
          section: "生命周期输出端口",
          label: "标签",
          enable: "启用",
          description: "说明",
          help: "可选的额外输出端口，在出错、完成以及每次状态变化时触发。",
          learnMore: "了解更多",
          error: {
            name: "错误",
            description:
              "当此节点抛出异常（意外失败）时，将消息发送到单独的输出，让你可以在专用连线上处理。",
          },
          complete: {
            name: "完成",
            description:
              "当此节点完成后，从单独的输出发出一条消息，让你可以触发后续操作。",
          },
          status: {
            name: "状态",
            description:
              "每当此节点的状态发生变化时，从单独的输出发出一条消息，让你的流程可以做出响应。",
          },
        },
      },
    },
    "zh-TW": {
      configs: { name: { label: "名稱" } },
      toggles: {
        errorPort: "錯誤端口",
        completePort: "完成端口",
        statusPort: "狀態端口",
      },
      portSettings: {
        title: "端口設定",
        inputsTable: {
          section: "輸入",
          label: "標籤",
          validate: "驗證資料",
          schema: "資料綱要",
          description: "說明",
          help: {
            validate: "在 input() 執行前，依輸入結構描述驗證傳入訊息。",
            learnMore: "瞭解更多",
          },
        },
        outputsTable: {
          section: "輸出",
          label: "標籤",
          validate: "驗證資料",
          schema: "資料綱要",
          description: "說明",
          help: {
            validate: "在發送前根據此埠的結構描述檢查發送的值。",
            learnMore: "瞭解更多",
          },
        },
        lifecyclePortsTable: {
          section: "生命週期輸出端口",
          label: "標籤",
          enable: "啟用",
          description: "說明",
          help: "可選的額外輸出連接埠，在發生錯誤、完成以及每次狀態變更時觸發。",
          learnMore: "瞭解更多",
          error: {
            name: "錯誤",
            description:
              "當此節點擲出例外（非預期的失敗）時，將訊息傳送到獨立的輸出，讓你可以在專用連線上處理。",
          },
          complete: {
            name: "完成",
            description:
              "當此節點完成後，從獨立的輸出發出一則訊息，讓你可以觸發後續操作。",
          },
          status: {
            name: "狀態",
            description:
              "每當此節點的狀態變更時，從獨立的輸出發出一則訊息，讓你的流程可以做出回應。",
          },
        },
      },
    },
  };

  return {
    name: "vite-plugin-node-red:client:locales-generator",
    apply: "build",
    enforce: "post",

    closeBundle() {
      function validateLanguage(lang: string, filePath: string) {
        if (!languages.includes(lang)) {
          throw new Error(
            `[locales] Invalid language "${lang}" in "${filePath}".\n` +
              `Supported: ${languages.join(", ")}`,
          );
        }
      }

      function forEachFile<T>(
        baseDir: string,
        fileExtensions: string[],
        processFile: (params: {
          ext: string;
          filePath: string;
          nodeType: string;
        }) => T | null,
      ): Map<string, T extends unknown[] ? T : Record<string, T>> {
        const langMap = new Map();

        if (!fs.existsSync(baseDir)) return langMap;

        const nodeDirs = fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());

        for (const nodeDir of nodeDirs) {
          const nodeType = nodeDir.name;
          const nodePath = path.join(baseDir, nodeType);
          const files = fs.readdirSync(nodePath);

          for (const file of files) {
            const ext = path.extname(file);
            if (!fileExtensions.includes(ext)) continue;

            const lang = path.basename(file, ext);
            const filePath = path.join(nodePath, file);
            validateLanguage(lang, filePath);

            const value = processFile({ ext, filePath, nodeType });
            if (value == null) continue;

            if (!langMap.has(lang)) {
              langMap.set(lang, Array.isArray(value) ? [] : {});
            }

            if (Array.isArray(value)) {
              langMap.get(lang).push(...value);
            } else {
              langMap.get(lang)[nodeType] = value;
            }
          }
        }

        return langMap;
      }

      function writeOutput<T>(
        langMap: Map<string, T>,
        fileName: string,
        serialize: (value: T) => string,
      ) {
        for (const [lang, data] of langMap.entries()) {
          const langOutDir = path.join(outDir, lang);
          fs.mkdirSync(langOutDir, { recursive: true });
          fs.writeFileSync(
            path.join(langOutDir, fileName),
            serialize(data),
            "utf-8",
          );
        }
      }

      const docLangs = forEachFile(
        docsDir,
        [".html", ".md"],
        ({ ext, filePath, nodeType }) => {
          const type =
            ext === ".html"
              ? "text/html"
              : ext === ".md"
                ? "text/markdown"
                : null;
          if (!type) return null;

          const content = fs.readFileSync(filePath, "utf-8");
          return [
            `<script type="${type}" data-help-name="${nodeType}">\n${content}\n</script>`,
          ];
        },
      );

      writeOutput(docLangs, "index.html", (value: string[]) =>
        value.join("\n"),
      );

      const labelLangs = forEachFile(
        labelsDir,
        [".json"],
        ({ filePath, nodeType }) => {
          const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (parsed[nodeType] && typeof parsed[nodeType] === "object") {
            console.warn(
              `[locales] Warning: "${filePath}" uses nested format (root key "${nodeType}"). ` +
                `Label files should be flat — the node type is added automatically. ` +
                `See https://bonsaedev.github.io/nrg/guide/building-and-running`,
            );
          }
          return parsed;
        },
      );

      // Inject framework labels as defaults for every node type.
      // User-provided labels take precedence over framework defaults.
      for (const [lang, nodeTypes] of labelLangs.entries()) {
        const defaults = frameworkLabels[lang] ?? frameworkLabels["en-US"];
        for (const nodeType of Object.keys(nodeTypes)) {
          nodeTypes[nodeType] = merge(
            structuredClone(defaults),
            nodeTypes[nodeType],
          );
        }
      }

      writeOutput(labelLangs, "index.json", (value) =>
        JSON.stringify(value, null, 2),
      );
    },
  };
}

export { localesGenerator };
