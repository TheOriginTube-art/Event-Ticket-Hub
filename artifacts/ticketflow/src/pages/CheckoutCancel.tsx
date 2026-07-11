import { Link } from "wouter";
import { XCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutCancel() {
  const searchParams = new URLSearchParams(window.location.search);
  const eventId = searchParams.get("eventId");

  return (
    <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
        <XCircle className="w-10 h-10 text-destructive" />
      </div>
      
      <h1 className="text-4xl font-bold mb-4">Оплата отменена</h1>
      <p className="text-muted-foreground max-w-md mx-auto mb-10 text-lg">
        Процесс покупки был прерван. Деньги не были списаны с вашего счета. Вы можете попробовать снова, когда будете готовы.
      </p>
      
      <div className="flex gap-4">
        {eventId && (
          <Link href={`/events/${eventId}`}>
            <Button size="lg" className="gap-2">
              Вернуться к событию
            </Button>
          </Link>
        )}
        <Link href="/events">
          <Button size="lg" variant="outline" className="gap-2 border-white/10">
            <ArrowLeft className="w-4 h-4" />
            В афишу
          </Button>
        </Link>
      </div>
    </div>
  );
}
