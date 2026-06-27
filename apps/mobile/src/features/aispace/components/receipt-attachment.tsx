import { Image, View } from "react-native";

// Inline receipt/image card (Figma "image 83") — right-aligned, mint border on deep green.
const receiptSample = require("@/public/img/receipt-sample.png");

export function ReceiptAttachment() {
  return (
    <View className="w-full flex-row justify-end px-3 py-2">
      <View className="h-32 w-48 overflow-hidden rounded-2xl border-[3px] border-[#DFFFE8] bg-[#034842]">
        <Image source={receiptSample} resizeMode="cover" className="h-full w-full" />
      </View>
    </View>
  );
}
