import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../../../../storage/store";
import { JOB_STATUSES, JOB_STATUS_LABEL, formatKzt } from "../../../../storage/model";
import { Body, Button, Card, Empty, Field, H2, Muted, Row, Screen, colors } from "../../../../ui/kit";

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const job = store.data.jobs.find((j) => j.id === id);
  if (!job) return <Screen><Empty title="Заказ не найден" /></Screen>;

  const { customers, vehicles } = store.data;
  const vehicle = vehicles.find((v) => v.id === job.vehicleId);
  const num = (t: string) => Number(t.replace(/\D/g, "")) || 0;

  return (
    <Screen>
      <Card>
        <Field label="Название" value={job.title} onChangeText={(v) => store.updateJob(job.id, { title: v })} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Стоимость, ₸" value={String(job.priceKzt || "")} onChangeText={(v) => store.updateJob(job.id, { priceKzt: num(v) })} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Оплачено, ₸" value={String(job.paidKzt || "")} onChangeText={(v) => store.updateJob(job.id, { paidKzt: num(v) })} keyboardType="number-pad" /></View>
        </View>
        <Row label="Остаток" value={formatKzt(Math.max(0, job.priceKzt - job.paidKzt))} />
      </Card>

      <H2>Статус</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {JOB_STATUSES.map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              store.updateJob(job.id, { status: s });
              store.logJob(job.id, `Статус: ${JOB_STATUS_LABEL[s]}`);
            }}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: job.status === s ? colors.accent : colors.card }}
          >
            <Text style={{ color: colors.text, fontWeight: "600" }}>{JOB_STATUS_LABEL[s]}</Text>
          </Pressable>
        ))}
      </View>

      <H2>Клиент</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {customers.length === 0 ? <Muted>Сначала добавьте клиента на вкладке «Клиенты».</Muted> : null}
        {customers.map((c) => (
          <Pressable key={c.id} onPress={() => store.updateJob(job.id, { customerId: c.id })} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: job.customerId === c.id ? colors.accent : colors.card }}>
            <Text style={{ color: colors.text }}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <H2>Автомобиль</H2>
      {vehicle ? <Card><Body style={{ fontWeight: "700" }}>{vehicle.title}</Body><Muted>VIN {vehicle.vin}</Muted></Card> : <Muted>Не привязан. Откройте авто на вкладке «Авто» и создайте заказ оттуда.</Muted>}
      {vehicle && job.customerId && vehicle.customerId !== job.customerId ? (
        <Button title="Привязать это авто к клиенту" kind="ghost" onPress={() => store.updateVehicle(vehicle.id, { customerId: job.customerId })} />
      ) : null}

      <Card>
        <Field label="Заметки" value={job.notes} onChangeText={(v) => store.updateJob(job.id, { notes: v })} multiline />
      </Card>

      <H2>История</H2>
      {[...job.log].reverse().map((l, i) => (
        <Muted key={i}>{new Date(l.t).toLocaleString("ru-RU")} · {l.text}</Muted>
      ))}

      <Button title="Удалить заказ" kind="danger" onPress={() => { store.removeJob(job.id); router.back(); }} />
    </Screen>
  );
}
