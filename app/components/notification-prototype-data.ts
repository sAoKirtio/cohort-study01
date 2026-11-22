// Seed-inspired examples. Refund decisions and delivery times are simulated.
export const recipients = {
  emma: "Emma Wilson · 学生",
  sarah: "Sarah Chen · 讲师",
  liam: "Liam Thompson · 个人购买者",
  marta: "Marta Novak · 团队购买者",
};

export type Recipient = keyof typeof recipients;
export interface Example {
  id: string;
  title: string;
  context?: string;
  excerpt?: string;
  detail?: string;
  destination?: string;
  time: string;
}

const firstProgram = "Your First TypeScript Program";
export const examples: Record<Recipient, Example[]> = {
  emma: [
    {
      id: "reply-sarah",
      title: "Sarah Chen 回复了你的问题",
      context: firstProgram,
      excerpt: "npx tsc --version",
      detail: "可以运行 npx tsc --version，使用项目里安装的 TypeScript。",
      destination: "课时讨论 / Sarah 的回复",
      time: "2 分钟前",
    },
    {
      id: "reply-james",
      title: "James Park 回复了你的问题",
      context: firstProgram,
      excerpt: "我也在项目目录里运行了 npx。",
      destination: "课时讨论 / James 的回复",
      time: "18 分钟前",
    },
    { id: "unavailable", title: "这条讨论已无法查看", time: "昨天" },
  ],
  sarah: [
    {
      id: "question-james",
      title: "James Park 提出了新问题",
      context: "Primitive Types",
      excerpt:
        "Does strict mode change anything about how this example behaves?",
      destination: "课时讨论 / James 的原问题",
      time: "5 分钟前",
    },
  ],
  liam: [
    {
      id: "request-liam",
      title: "退款申请已批准",
      context: "Introduction to TypeScript · 个人购买",
      excerpt: "管理员已批准你对这笔购买的退款申请。",
      destination: "设置 / 个人购买 / 本次退款申请",
      time: "今天 09:12",
    },
  ],
  marta: [
    {
      id: "request-marta",
      title: "退款申请已拒绝",
      context: "Design Systems with Tailwind · 团队许可",
      excerpt: "拒绝原因：申请材料中的购买信息与这笔订单不符。",
      destination: "设置 / 团队许可 / 本次退款申请",
      time: "昨天 16:40",
    },
  ],
};
