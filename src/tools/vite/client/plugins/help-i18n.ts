interface HelpTranslations {
  sections: {
    properties: string;
    credentials: string;
    input: string;
    output: string;
    outputs: string;
    port: string;
    settings: string;
    complete: string;
    /** Built-in error port. */
    error: string;
    /** Built-in status port. */
    status: string;
  };
  columns: {
    property: string;
    label: string;
    type: string;
    required: string;
    default: string;
    description: string;
  };
  values: {
    yes: string;
    no: string;
  };
  captions: {
    /** Frames an object-typed output port so its rows read as ONE output
     * emitting an object, not several separate output ports. */
    objectProperties: string;
  };
  notes: {
    /** Explains the output message envelope (return property + source/input),
     * which the type sections don't otherwise reveal. */
    outputEnvelope: string;
  };
}

const translations: Record<string, HelpTranslations> = {
  "en-US": {
    sections: {
      properties: "Properties",
      credentials: "Credentials",
      input: "Input",
      output: "Output",
      outputs: "Outputs",
      port: "Port",
      settings: "Settings",
      complete: "Complete",
      error: "Error",
      status: "Status",
    },
    columns: {
      property: "Property",
      label: "Label",
      type: "Type",
      required: "Required",
      default: "Default",
      description: "Description",
    },
    values: {
      yes: "Yes",
      no: "No",
    },
    captions: {
      objectProperties: "This output carries an object with these properties:",
    },
    notes: {
      outputEnvelope:
        "Data outputs are placed under the return property (default <code>output</code>). Every port message also carries <code>source</code> (the producing node) and <code>input</code> (the message being processed).",
    },
  },
  de: {
    sections: {
      properties: "Eigenschaften",
      credentials: "Zugangsdaten",
      input: "Eingang",
      output: "Ausgang",
      outputs: "Ausgänge",
      port: "Port",
      settings: "Einstellungen",
      complete: "Abschluss",
      error: "Fehler",
      status: "Status",
    },
    columns: {
      property: "Eigenschaft",
      label: "Bezeichnung",
      type: "Typ",
      required: "Erforderlich",
      default: "Standard",
      description: "Beschreibung",
    },
    values: {
      yes: "Ja",
      no: "Nein",
    },
    captions: {
      objectProperties:
        "Dieser Ausgang liefert ein Objekt mit diesen Eigenschaften:",
    },
    notes: {
      outputEnvelope:
        "Datenausgaben werden unter der Rückgabe-Eigenschaft abgelegt (Standard <code>output</code>). Jede Port-Nachricht enthält zudem <code>source</code> (den erzeugenden Node) und <code>input</code> (die verarbeitete Nachricht).",
    },
  },
  "es-ES": {
    sections: {
      properties: "Propiedades",
      credentials: "Credenciales",
      input: "Entrada",
      output: "Salida",
      outputs: "Salidas",
      port: "Puerto",
      settings: "Configuración",
      complete: "Completado",
      error: "Error",
      status: "Estado",
    },
    columns: {
      property: "Propiedad",
      label: "Etiqueta",
      type: "Tipo",
      required: "Requerido",
      default: "Predeterminado",
      description: "Descripción",
    },
    values: {
      yes: "Sí",
      no: "No",
    },
    captions: {
      objectProperties: "Esta salida devuelve un objeto con estas propiedades:",
    },
    notes: {
      outputEnvelope:
        "Las salidas de datos se colocan bajo la propiedad de retorno (predeterminado <code>output</code>). Cada mensaje de puerto también incluye <code>source</code> (el nodo que lo produce) e <code>input</code> (el mensaje en proceso).",
    },
  },
  fr: {
    sections: {
      properties: "Propriétés",
      credentials: "Identifiants",
      input: "Entrée",
      output: "Sortie",
      outputs: "Sorties",
      port: "Port",
      settings: "Paramètres",
      complete: "Terminé",
      error: "Erreur",
      status: "Statut",
    },
    columns: {
      property: "Propriété",
      label: "Libellé",
      type: "Type",
      required: "Requis",
      default: "Par défaut",
      description: "Description",
    },
    values: {
      yes: "Oui",
      no: "Non",
    },
    captions: {
      objectProperties: "Cette sortie fournit un objet avec ces propriétés :",
    },
    notes: {
      outputEnvelope:
        "Les sorties de données sont placées sous la propriété de retour (par défaut <code>output</code>). Chaque message de port comporte aussi <code>source</code> (le nœud émetteur) et <code>input</code> (le message traité).",
    },
  },
  ko: {
    sections: {
      properties: "속성",
      credentials: "자격 증명",
      input: "입력",
      output: "출력",
      outputs: "출력",
      port: "포트",
      settings: "설정",
      complete: "완료",
      error: "오류",
      status: "상태",
    },
    columns: {
      property: "속성",
      label: "라벨",
      type: "유형",
      required: "필수",
      default: "기본값",
      description: "설명",
    },
    values: {
      yes: "예",
      no: "아니오",
    },
    captions: {
      objectProperties: "이 출력은 다음 속성을 가진 객체를 전달합니다:",
    },
    notes: {
      outputEnvelope:
        "데이터 출력은 반환 속성 아래에 배치됩니다(기본값 <code>output</code>). 모든 포트 메시지에는 <code>source</code>(생성한 노드)와 <code>input</code>(처리 중인 메시지)도 포함됩니다.",
    },
  },
  "pt-BR": {
    sections: {
      properties: "Propriedades",
      credentials: "Credenciais",
      input: "Entrada",
      output: "Saída",
      outputs: "Saídas",
      port: "Porta",
      settings: "Configurações",
      complete: "Concluído",
      error: "Erro",
      status: "Status",
    },
    columns: {
      property: "Propriedade",
      label: "Rótulo",
      type: "Tipo",
      required: "Obrigatório",
      default: "Padrão",
      description: "Descrição",
    },
    values: {
      yes: "Sim",
      no: "Não",
    },
    captions: {
      objectProperties: "Esta saída retorna um objeto com estas propriedades:",
    },
    notes: {
      outputEnvelope:
        "As saídas de dados são colocadas sob a propriedade de retorno (padrão <code>output</code>). Cada mensagem de porta também carrega <code>source</code> (o nó de origem) e <code>input</code> (a mensagem em processamento).",
    },
  },
  ru: {
    sections: {
      properties: "Свойства",
      credentials: "Учётные данные",
      input: "Вход",
      output: "Выход",
      outputs: "Выходы",
      port: "Порт",
      settings: "Настройки",
      complete: "Завершение",
      error: "Ошибка",
      status: "Статус",
    },
    columns: {
      property: "Свойство",
      label: "Метка",
      type: "Тип",
      required: "Обязательно",
      default: "По умолчанию",
      description: "Описание",
    },
    values: {
      yes: "Да",
      no: "Нет",
    },
    captions: {
      objectProperties:
        "Этот выход возвращает объект со следующими свойствами:",
    },
    notes: {
      outputEnvelope:
        "Выходные данные помещаются в свойство возврата (по умолчанию <code>output</code>). Каждое сообщение порта также содержит <code>source</code> (узел-источник) и <code>input</code> (обрабатываемое сообщение).",
    },
  },
  ja: {
    sections: {
      properties: "プロパティ",
      credentials: "認証情報",
      input: "入力",
      output: "出力",
      outputs: "出力",
      port: "ポート",
      settings: "設定",
      complete: "完了",
      error: "エラー",
      status: "ステータス",
    },
    columns: {
      property: "プロパティ",
      label: "ラベル",
      type: "型",
      required: "必須",
      default: "デフォルト",
      description: "説明",
    },
    values: {
      yes: "はい",
      no: "いいえ",
    },
    captions: {
      objectProperties: "この出力は次のプロパティを持つオブジェクトを返します:",
    },
    notes: {
      outputEnvelope:
        "データ出力は戻りプロパティ（既定は <code>output</code>）の下に格納されます。各ポートのメッセージには <code>source</code>（生成元ノード）と <code>input</code>（処理中のメッセージ）も含まれます。",
    },
  },
  "zh-CN": {
    sections: {
      properties: "属性",
      credentials: "凭证",
      input: "输入",
      output: "输出",
      outputs: "输出",
      port: "端口",
      settings: "设置",
      complete: "完成",
      error: "错误",
      status: "状态",
    },
    columns: {
      property: "属性",
      label: "标签",
      type: "类型",
      required: "必填",
      default: "默认值",
      description: "描述",
    },
    values: {
      yes: "是",
      no: "否",
    },
    captions: {
      objectProperties: "此输出返回包含以下属性的对象：",
    },
    notes: {
      outputEnvelope:
        "数据输出放在返回属性下（默认 <code>output</code>）。每个端口消息还带有 <code>source</code>（产生该消息的节点）和 <code>input</code>（正在处理的消息）。",
    },
  },
  "zh-TW": {
    sections: {
      properties: "屬性",
      credentials: "憑證",
      input: "輸入",
      output: "輸出",
      outputs: "輸出",
      port: "埠",
      settings: "設定",
      complete: "完成",
      error: "錯誤",
      status: "狀態",
    },
    columns: {
      property: "屬性",
      label: "標籤",
      type: "類型",
      required: "必填",
      default: "預設值",
      description: "描述",
    },
    values: {
      yes: "是",
      no: "否",
    },
    captions: {
      objectProperties: "此輸出傳回包含以下屬性的物件：",
    },
    notes: {
      outputEnvelope:
        "資料輸出置於回傳屬性之下（預設 <code>output</code>）。每個埠訊息也會帶有 <code>source</code>（產生訊息的節點）與 <code>input</code>（正在處理的訊息）。",
    },
  },
};

function getHelpTranslations(lang: string): HelpTranslations {
  return translations[lang] ?? translations["en-US"];
}

export { getHelpTranslations };
export type { HelpTranslations };
