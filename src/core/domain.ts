export type Role = "colaborador" | "gerente" | "diretor" | "admin";
export interface Person {
  id: string;
  name: string;
  role: Role;
  stores: string[];
  label: string;
}
export interface Notice {
  id: string;
  version: number;
  title: string;
  body: string;
  category: string;
  stores: string[];
  urgent: boolean;
  date: string;
}
export interface Receipt {
  personId: string;
  noticeId: string;
  version: number;
  at: string;
}
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  detail: string;
  at: string;
}
export interface Task {
  id: string;
  store: string;
  owner: string;
  title: string;
  time: string;
  area: string;
}
export interface DemoState {
  schema: 1;
  notices: Notice[];
  receipts: Receipt[];
  completed: string[];
  events: AuditEvent[];
  logo: string;
  disabledModules: string[];
}

export const people: Person[] = [
  {
    id: "ana",
    name: "Ana Oliveira",
    role: "gerente",
    stores: ["001"],
    label: "Loja 001 · Centro",
  },
  {
    id: "lucas",
    name: "Lucas Santos",
    role: "colaborador",
    stores: ["001"],
    label: "Loja 001 · Centro",
  },
  {
    id: "carla",
    name: "Carla Lima",
    role: "diretor",
    stores: ["001", "002"],
    label: "Regional São Paulo · 2 lojas",
  },
  {
    id: "admin",
    name: "Matheus Oliveira",
    role: "admin",
    stores: ["001", "002"],
    label: "Administração · Todas as lojas",
  },
];
export const roleLabels: Record<Role, string> = {
  colaborador: "Colaborador",
  gerente: "Gerente",
  diretor: "Diretor",
  admin: "Administrador",
};

// Regras do domínio para a demonstração. O servidor futuro deve aplicá-las novamente.
export function canReadNotice(person: Person, notice: Notice): boolean {
  return (
    person.role === "admin" ||
    notice.stores.some((store) => person.stores.includes(store))
  );
}
export function canPublish(person: Person): boolean {
  return person.role === "admin" || person.role === "diretor";
}
export function canTarget(person: Person, stores: string[]): boolean {
  return (
    canPublish(person) &&
    stores.length > 0 &&
    stores.every((store) => person.stores.includes(store))
  );
}
export function hasAcknowledged(
  receipts: Receipt[],
  person: Person,
  notice: Notice,
): boolean {
  return receipts.some(
    (r) =>
      r.personId === person.id &&
      r.noticeId === notice.id &&
      r.version === notice.version,
  );
}
export function acknowledge(
  receipts: Receipt[],
  person: Person,
  notice: Notice,
  at: string,
): Receipt[] {
  if (!canReadNotice(person, notice))
    throw new Error("Comunicado fora da abrangência.");
  if (hasAcknowledged(receipts, person, notice)) return receipts;
  return [
    ...receipts,
    { personId: person.id, noticeId: notice.id, version: notice.version, at },
  ];
}
export function visibleTasks(person: Person, tasks: Task[]): Task[] {
  return tasks.filter(
    (task) =>
      person.stores.includes(task.store) &&
      (person.role !== "colaborador" || task.owner === person.id),
  );
}

export const tasks: Task[] = [
  {
    id: "t1",
    store: "001",
    owner: "ana",
    title: "Conferir a abertura da loja",
    time: "09:00",
    area: "Checklist de abertura",
  },
  {
    id: "t2",
    store: "001",
    owner: "lucas",
    title: "Revisar a comunicação da vitrine",
    time: "11:00",
    area: "Experiência de loja",
  },
  {
    id: "t3",
    store: "001",
    owner: "ana",
    title: "Alinhar as prioridades com a equipe",
    time: "14:00",
    area: "Gestão da equipe",
  },
  {
    id: "t4",
    store: "002",
    owner: "bruno",
    title: "Validar a organização do salão",
    time: "10:00",
    area: "Checklist de abertura",
  },
];
export function initialState(): DemoState {
  return {
    schema: 1,
    receipts: [],
    completed: [],
    events: [],
    logo: "",
    disabledModules: [],
    notices: [
      {
        id: "n1",
        version: 1,
        title: "Uma experiência melhor começa na nossa loja",
        body: "Nesta rodada de demonstração, alinhe com a equipe a recepção dos clientes e a organização dos espaços. Confira a entrada, a comunicação de preços e os pontos de atendimento.\n\nDepois de ler as orientações, confirme sua ciência. O registro desta prévia fica apenas neste navegador.",
        category: "Operações",
        stores: ["001", "002"],
        urgent: true,
        date: "2026-10-29T09:00:00-03:00",
      },
      {
        id: "n2",
        version: 1,
        title: "Vamos preparar o próximo ciclo de vendas",
        body: "Reúna as oportunidades observadas pela equipe ao longo do dia. Registre os principais pontos para o próximo alinhamento e compartilhe dúvidas com sua liderança.\n\nEste é um comunicado fictício para avaliar o fluxo de leitura e confirmação.",
        category: "Equipe & cultura",
        stores: ["001", "002"],
        urgent: false,
        date: "2026-10-28T14:00:00-03:00",
      },
      {
        id: "n3",
        version: 1,
        title: "Organização do estoque da loja 002",
        body: "Orientação demonstrativa restrita à loja 002. Gerente e colaborador da loja 001 não devem encontrar este comunicado em sua visão.",
        category: "Rotina de loja",
        stores: ["002"],
        urgent: false,
        date: "2026-10-28T10:00:00-03:00",
      },
    ],
  };
}
