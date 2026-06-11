import type { VendorOption } from "@shared/types";
import type React from "react";
import { Card, List, Space, Typography } from "antd";

export function VendorList({
  vendors,
  selectedVendorId,
  onSelect,
}: {
  vendors: VendorOption[];
  selectedVendorId?: string;
  onSelect: (vendorId: string) => void;
}): React.ReactElement {
  return (
    <Card title="发行商" className="operation-card">
      <List
        className="vendor-list"
        dataSource={vendors}
        renderItem={(vendor) => (
          <List.Item
            className={vendor.id === selectedVendorId ? "vendor-item vendor-item-active" : "vendor-item"}
            onClick={() => onSelect(vendor.id)}
          >
            <Space className="vendor-item-content" direction="vertical" size={2}>
              <Typography.Text strong className="vendor-item-name">
                {vendor.name}
              </Typography.Text>
              <Typography.Text className="vendor-item-homepage" type="secondary">
                {vendor.homepage}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
