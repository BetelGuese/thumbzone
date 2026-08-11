import Button from '@mui/material/Button'

export default function ThumbzoneMenu({ items }: { items: string[] }) {
  return <Button variant="contained">{items.length} items</Button>
}
