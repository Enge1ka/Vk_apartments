import { Card, CardContent } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { formatCurrency } from '@/shared/lib/bookingUtils'
import { APARTMENT_STATUS_BADGE, getBadge } from '@/shared/constants/status'
import type { Apartment } from '../api'

interface ApartmentCardProps {
  apt: Apartment
  onEdit: (apt: Apartment) => void
}

export function ApartmentCard({ apt, onEdit }: ApartmentCardProps) {
  const badge = getBadge(APARTMENT_STATUS_BADGE, apt.status)

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-bold text-gray-900 text-lg">{apt.apartment_number}</p>
            <p className="text-sm text-gray-500">{apt.type} - {apt.location?.name}</p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="flex gap-3 text-sm text-gray-600 mt-3">
          <span>{formatCurrency(apt.daily_rate)}/day</span>
          {apt.monthly_rate && <span>{formatCurrency(apt.monthly_rate)}/month</span>}
        </div>
        {apt.notes && <p className="text-xs text-gray-400 mt-2">{apt.notes}</p>}
        <button onClick={() => onEdit(apt)} className="mt-3 text-xs text-[#1e3a5f] font-medium hover:underline">
          Edit
        </button>
      </CardContent>
    </Card>
  )
}
