import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../../../storage/store";
import { JOB_STATUS_LABEL, formatKzt } from "../../../storage/model";
import { Badge, Body, Button, Card, Empty, Field, Muted, Screen, colors } from "../../../ui/kit";

export default function ClientsScreen() {
  const router = useRouter();
  const store = useStore();
  const [tab, setTab] = useState<"clients" | "jobs">("jobs");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { customers, jobs, vehicles } = store.data;
  const debt = jobs.filter((j) => j.status !== "cancelled").reduce((s, j) => s + Math.max(0, j.priceKzt - j.paidKzt), 0);
  const revenue = jobs.filter((j) => j.status !== "cancelled").reduce((s, j) => s + j.paidKzt, 0);

  function add() {
    if (!name.trim()) return;
    const c = store.addCustomer({ name: name.trim(), phone: phone.trim(), notes: "" });
    setName("");
    setPhone("");
    setAdding(false);
    router.push({ pathname: "/clients/customer/[id]", params: { id: c.id } });
  }

  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1 }}><Muted>Получено</Muted><Body style={{ fontSize: 18, fontWeight: "800" }}>{formatKzt(revenue)}</Body></Card>
        <Card style={{ flex: 1 }}><Muted>Должны нам</Muted><Body style={{ fontSize: 18, fontWeight: "800", color: debt ? colors.warn : colors.text }}>{formatKzt(debt)}</Body></Card>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["jobs", "clients"] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: tab === k ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{k === "jobs" ? `Заказы (${jobs.length})` : `Клиенты (${customers.length})`}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "jobs" ? (
        <>
          <Button title="Новый заказ" onPress={() => router.push({ pathname: "/clients/job/[id]", params: { id: store.addJob({ title: "Новый заказ" }).id } })} />
          {jobs.length === 0 ? <Empty title="Заказов пока нет" hint="Заказ создаётся из карточки авто после диагностики или вручную." /> : null}
          {jobs.map((j) => {
            const customer = customers.find((c) => c.id === j.customerId);
            const vehicle = vehicles.find((v) => v.id === j.vehicleId);
            return (
              <Pressable key={j.id} onPress={() => router.push({ pathname: "/clients/job/[id]", params: { id: j.id } })}>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Body style={{ fontWeight: "700", flex: 1 }}>{j.title}</Body>
                    <Badge tone={j.status === "done" ? "good" : j.status === "cancelled" ? "muted" : "accent"} text={JOB_STATUS_LABEL[j.status]} />
                  </View>
                  <Muted>{[customer?.name, vehicle?.title].filter(Boolean).join(" · ") || "Клиент и авто не указаны"}</Muted>
                  <Muted>{formatKzt(j.priceKzt)} · оплачено {formatKzt(j.paidKzt)}</Muted>
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : (
        <>
          {adding ? (
            <Card>
              <Field label="Имя" value={name} onChangeText={setName} />
              <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Button title="Сохранить" onPress={add} />
              <Button title="Отмена" kind="ghost" onPress={() => setAdding(false)} />
            </Card>
          ) : (
            <Button title="Добавить клиента" onPress={() => setAdding(true)} />
          )}
          {customers.length === 0 ? <Empty title="Клиентов пока нет" /> : null}
          {customers.map((c) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: "/clients/customer/[id]", params: { id: c.id } })}>
              <Card>
                <Body style={{ fontWeight: "700" }}>{c.name}</Body>
                <Muted>{c.phone || "телефон не указан"} · авто: {vehicles.filter((v) => v.customerId === c.id).length} · заказов: {jobs.filter((j) => j.customerId === c.id).length}</Muted>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
