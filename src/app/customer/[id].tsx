import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable } from "react-native";
import { useStore } from "../../storage/store";
import { JOB_STATUS_LABEL, formatKzt } from "../../storage/model";
import { Badge, Body, Button, Card, Empty, Field, H2, Muted, Screen } from "../../ui/kit";

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const customer = store.data.customers.find((c) => c.id === id);
  if (!customer) return <Screen><Empty title="Клиент не найден" /></Screen>;

  const vehicles = store.data.vehicles.filter((v) => v.customerId === customer.id);
  const jobs = store.data.jobs.filter((j) => j.customerId === customer.id);
  const digits = customer.phone.replace(/\D/g, "");

  return (
    <Screen>
      <Card>
        <Field label="Имя" value={customer.name} onChangeText={(v) => store.updateCustomer(customer.id, { name: v })} />
        <Field label="Телефон" value={customer.phone} onChangeText={(v) => store.updateCustomer(customer.id, { phone: v })} keyboardType="phone-pad" />
        <Field label="Заметки" value={customer.notes} onChangeText={(v) => store.updateCustomer(customer.id, { notes: v })} multiline />
        {digits ? <Button title="Написать в WhatsApp" kind="ghost" onPress={() => void Linking.openURL(`https://wa.me/${digits}`)} /> : null}
      </Card>

      <H2>Автомобили</H2>
      {vehicles.length === 0 ? <Muted>Пока нет. Привяжите авто в заказе.</Muted> : null}
      {vehicles.map((v) => (
        <Card key={v.id}>
          <Body style={{ fontWeight: "700" }}>{v.title}</Body>
          <Muted>VIN {v.vin || "—"} · сканирований: {v.scans.length}</Muted>
        </Card>
      ))}

      <H2>Заказы</H2>
      {jobs.map((j) => (
        <Pressable key={j.id} onPress={() => router.push({ pathname: "/job/[id]", params: { id: j.id } })}>
          <Card>
            <Body style={{ fontWeight: "700" }}>{j.title}</Body>
            <Badge text={JOB_STATUS_LABEL[j.status]} tone="accent" />
            <Muted>{formatKzt(j.priceKzt)} · оплачено {formatKzt(j.paidKzt)}</Muted>
          </Card>
        </Pressable>
      ))}
      <Button title="Новый заказ для клиента" onPress={() => router.push({ pathname: "/job/[id]", params: { id: store.addJob({ title: "Новый заказ", customerId: customer.id }).id } })} />
      <Button title="Удалить клиента" kind="danger" onPress={() => { store.removeCustomer(customer.id); router.back(); }} />
    </Screen>
  );
}
