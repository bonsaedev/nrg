import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
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
      configs: { name: "Name" },
      toggles: {
        validateInput: "Validate Data",
        errorPort: "Error Port",
        completePort: "Complete Port",
        statusPort: "Status Port",
      },
      sections: {
        portsSettings: "Ports Settings",
        input: "Input",
        outputs: "Outputs",
        lifecyclePorts: "Lifecycle Output Ports",
      },
      outputs: {
        port: "Port",
        label: "Label",
        validate: "Validate Data",
        returnProperty: "Return Property",
        contextMode: "Context Mode",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Validate incoming messages against the input schema before input() runs.",
        outputs:
          "Per-port output settings. Validate Data checks the sent value against the port's schema; Context Mode controls how the incoming message is carried.",
        lifecyclePorts:
          "Optional extra output ports that fire on error, on completion, and on every status change.",
        learnMore: "Learn more",
      },
      lifecyclePorts: {
        port: "Port",
        enable: "Enable",
        description: "Description",
        error: {
          name: "Error",
          description:
            "Routes the message to a separate output when this node fails, so you can handle errors on their own wire.",
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
    de: {
      configs: { name: "Name" },
      toggles: {
        validateInput: "Daten validieren",
        errorPort: "Fehler-Port",
        completePort: "Abschluss-Port",
        statusPort: "Status-Port",
      },
      sections: {
        portsSettings: "Port-Einstellungen",
        input: "Eingang",
        outputs: "Ausgänge",
        lifecyclePorts: "Lebenszyklus-Ausgangsports",
      },
      outputs: {
        port: "Port",
        label: "Bezeichnung",
        validate: "Daten validieren",
        returnProperty: "Rückgabe-Eigenschaft",
        contextMode: "Kontextmodus",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Eingehende Nachrichten vor dem Ausführen von input() gegen das Eingabe-Schema validieren.",
        outputs:
          "Ausgabe-Einstellungen pro Port. Daten validieren prüft den gesendeten Wert gegen das Schema des Ports; Kontextmodus steuert, wie die eingehende Nachricht übertragen wird.",
        lifecyclePorts:
          "Optionale zusätzliche Ausgänge, die bei Fehler, Abschluss und jeder Statusänderung auslösen.",
        learnMore: "Mehr erfahren",
      },
      lifecyclePorts: {
        port: "Port",
        enable: "Aktivieren",
        description: "Beschreibung",
        error: {
          name: "Fehler",
          description:
            "Leitet die Nachricht an einen separaten Ausgang weiter, wenn dieser Node fehlschlägt, sodass Sie Fehler auf einer eigenen Leitung behandeln können.",
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
    "es-ES": {
      configs: { name: "Nombre" },
      toggles: {
        validateInput: "Validar datos",
        errorPort: "Puerto de error",
        completePort: "Puerto de completado",
        statusPort: "Puerto de estado",
      },
      sections: {
        portsSettings: "Configuración de puertos",
        input: "Entrada",
        outputs: "Salidas",
        lifecyclePorts: "Puertos de salida de ciclo de vida",
      },
      outputs: {
        port: "Puerto",
        label: "Etiqueta",
        validate: "Validar datos",
        returnProperty: "Propiedad de retorno",
        contextMode: "Modo de contexto",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Valida los mensajes entrantes con el esquema de entrada antes de ejecutar input().",
        outputs:
          "Ajustes de salida por puerto. Validar datos comprueba el valor enviado con el esquema del puerto; Modo de contexto controla cómo se transporta el mensaje entrante.",
        lifecyclePorts:
          "Puertos de salida adicionales opcionales que se activan en error, al completar y en cada cambio de estado.",
        learnMore: "Más información",
      },
      lifecyclePorts: {
        port: "Puerto",
        enable: "Activar",
        description: "Descripción",
        error: {
          name: "Error",
          description:
            "Dirige el mensaje a una salida independiente cuando este nodo falla, para que puedas gestionar los errores en su propio cable.",
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
    fr: {
      configs: { name: "Nom" },
      toggles: {
        validateInput: "Valider les données",
        errorPort: "Port d'erreur",
        completePort: "Port de complétion",
        statusPort: "Port de statut",
      },
      sections: {
        portsSettings: "Paramètres des ports",
        input: "Entrée",
        outputs: "Sorties",
        lifecyclePorts: "Ports de sortie de cycle de vie",
      },
      outputs: {
        port: "Port",
        label: "Libellé",
        validate: "Valider les données",
        returnProperty: "Propriété de retour",
        contextMode: "Mode de contexte",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Valide les messages entrants avec le schéma d'entrée avant l'exécution de input().",
        outputs:
          "Réglages de sortie par port. Valider les données vérifie la valeur envoyée avec le schéma du port ; Mode de contexte contrôle la façon dont le message entrant est transmis.",
        lifecyclePorts:
          "Ports de sortie supplémentaires optionnels déclenchés en cas d'erreur, à la fin et à chaque changement de statut.",
        learnMore: "En savoir plus",
      },
      lifecyclePorts: {
        port: "Port",
        enable: "Activer",
        description: "Description",
        error: {
          name: "Erreur",
          description:
            "Achemine le message vers une sortie distincte lorsque ce nœud échoue, pour que vous puissiez gérer les erreurs sur leur propre fil.",
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
    ko: {
      configs: { name: "이름" },
      toggles: {
        validateInput: "데이터 검증",
        errorPort: "오류 포트",
        completePort: "완료 포트",
        statusPort: "상태 포트",
      },
      sections: {
        portsSettings: "포트 설정",
        input: "입력",
        outputs: "출력",
        lifecyclePorts: "수명 주기 출력 포트",
      },
      outputs: {
        port: "포트",
        label: "레이블",
        validate: "데이터 검증",
        returnProperty: "반환 속성",
        contextMode: "컨텍스트 모드",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "input() 실행 전에 들어오는 메시지를 입력 스키마로 검증합니다.",
        outputs:
          "포트별 출력 설정. 데이터 검증은 전송 값을 포트 스키마로 확인하고, 컨텍스트 모드는 들어온 메시지를 전달하는 방식을 제어합니다.",
        lifecyclePorts:
          "오류, 완료, 모든 상태 변경 시 발생하는 선택적 추가 출력 포트입니다.",
        learnMore: "자세히 보기",
      },
      lifecyclePorts: {
        port: "포트",
        enable: "활성화",
        description: "설명",
        error: {
          name: "오류",
          description:
            "이 노드가 실패하면 메시지를 별도의 출력으로 보내, 오류를 전용 연결선에서 처리할 수 있습니다.",
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
    "pt-BR": {
      configs: { name: "Nome" },
      toggles: {
        validateInput: "Validar dados",
        errorPort: "Porta de Erro",
        completePort: "Porta de Conclusão",
        statusPort: "Porta de Status",
      },
      sections: {
        portsSettings: "Configurações de portas",
        input: "Entrada",
        outputs: "Saídas",
        lifecyclePorts: "Portas de saída de ciclo de vida",
      },
      outputs: {
        port: "Porta",
        label: "Rótulo",
        validate: "Validar dados",
        returnProperty: "Propriedade de retorno",
        contextMode: "Modo de contexto",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Valida as mensagens recebidas com o esquema de entrada antes de input() executar.",
        outputs:
          "Configurações de saída por porta. Validar dados verifica o valor enviado com o esquema da porta; Modo de contexto controla como a mensagem recebida é transportada.",
        lifecyclePorts:
          "Portas de saída extras opcionais que disparam em erro, na conclusão e a cada mudança de status.",
        learnMore: "Saiba mais",
      },
      lifecyclePorts: {
        port: "Porta",
        enable: "Ativar",
        description: "Descrição",
        error: {
          name: "Erro",
          description:
            "Encaminha a mensagem para uma saída separada quando este nó falha, para que você possa tratar os erros em um fio próprio.",
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
    ru: {
      configs: { name: "Имя" },
      toggles: {
        validateInput: "Проверять данные",
        errorPort: "Порт ошибки",
        completePort: "Порт завершения",
        statusPort: "Порт статуса",
      },
      sections: {
        portsSettings: "Настройки портов",
        input: "Вход",
        outputs: "Выходы",
        lifecyclePorts: "Выходные порты жизненного цикла",
      },
      outputs: {
        port: "Порт",
        label: "Метка",
        validate: "Проверять данные",
        returnProperty: "Свойство возврата",
        contextMode: "Режим контекста",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "Проверять входящие сообщения по схеме ввода перед вызовом input().",
        outputs:
          "Настройки вывода для каждого порта. «Проверять данные» сверяет отправленное значение со схемой порта; «Режим контекста» управляет тем, как переносится входящее сообщение.",
        lifecyclePorts:
          "Дополнительные необязательные выходные порты, срабатывающие при ошибке, завершении и каждом изменении статуса.",
        learnMore: "Подробнее",
      },
      lifecyclePorts: {
        port: "Порт",
        enable: "Включить",
        description: "Описание",
        error: {
          name: "Ошибка",
          description:
            "Направляет сообщение на отдельный выход, когда этот узел завершается с ошибкой, чтобы вы могли обрабатывать ошибки на отдельном проводе.",
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
    ja: {
      configs: { name: "名前" },
      toggles: {
        validateInput: "データを検証",
        errorPort: "エラーポート",
        completePort: "完了ポート",
        statusPort: "ステータスポート",
      },
      sections: {
        portsSettings: "ポート設定",
        input: "入力",
        outputs: "出力",
        lifecyclePorts: "ライフサイクル出力ポート",
      },
      outputs: {
        port: "ポート",
        label: "ラベル",
        validate: "データを検証",
        returnProperty: "戻りプロパティ",
        contextMode: "コンテキストモード",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput:
          "input() の実行前に、受信メッセージを入力スキーマで検証します。",
        outputs:
          "ポートごとの出力設定。データの検証は送信値をポートのスキーマで確認し、コンテキストモードは受信メッセージの引き継ぎ方を制御します。",
        lifecyclePorts:
          "エラー時・完了時・ステータス変更ごとに発火する任意の追加出力ポート。",
        learnMore: "詳細",
      },
      lifecyclePorts: {
        port: "ポート",
        enable: "有効化",
        description: "説明",
        error: {
          name: "エラー",
          description:
            "このノードが失敗したときにメッセージを別の出力へ送り、エラーを専用の線で処理できるようにします。",
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
    "zh-CN": {
      configs: { name: "名称" },
      toggles: {
        validateInput: "验证数据",
        errorPort: "错误端口",
        completePort: "完成端口",
        statusPort: "状态端口",
      },
      sections: {
        portsSettings: "端口设置",
        input: "输入",
        outputs: "输出",
        lifecyclePorts: "生命周期输出端口",
      },
      outputs: {
        port: "端口",
        label: "标签",
        validate: "验证数据",
        returnProperty: "返回属性",
        contextMode: "上下文模式",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput: "在 input() 运行前，根据输入结构描述校验传入消息。",
        outputs:
          "按端口的输出设置。验证数据根据端口结构描述校验发送的值；上下文模式控制如何携带传入消息。",
        lifecyclePorts:
          "可选的额外输出端口，在出错、完成以及每次状态变化时触发。",
        learnMore: "了解更多",
      },
      lifecyclePorts: {
        port: "端口",
        enable: "启用",
        description: "说明",
        error: {
          name: "错误",
          description:
            "当此节点失败时，将消息发送到单独的输出，让你可以在专用连线上处理错误。",
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
    "zh-TW": {
      configs: { name: "名稱" },
      toggles: {
        validateInput: "驗證資料",
        errorPort: "錯誤端口",
        completePort: "完成端口",
        statusPort: "狀態端口",
      },
      sections: {
        portsSettings: "端口設定",
        input: "輸入",
        outputs: "輸出",
        lifecyclePorts: "生命週期輸出端口",
      },
      outputs: {
        port: "端口",
        label: "標籤",
        validate: "驗證資料",
        returnProperty: "返回屬性",
        contextMode: "內容模式",
      },
      contextModes: {
        modes: {
          carry: "carry",
          trace: "trace",
          reset: "reset",
        },
      },
      help: {
        validateInput: "在 input() 執行前，依輸入結構描述驗證傳入訊息。",
        outputs:
          "依連接埠的輸出設定。驗證資料依連接埠結構描述檢查送出的值；內容模式控制如何攜帶傳入訊息。",
        lifecyclePorts:
          "可選的額外輸出連接埠，在發生錯誤、完成以及每次狀態變更時觸發。",
        learnMore: "瞭解更多",
      },
      lifecyclePorts: {
        port: "端口",
        enable: "啟用",
        description: "說明",
        error: {
          name: "錯誤",
          description:
            "當此節點失敗時，將訊息傳送到獨立的輸出，讓你可以在專用連線上處理錯誤。",
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
