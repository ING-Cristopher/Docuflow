using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DocuFlow.Infrastructure.Persistence.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class AddPostgresDocumentQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DocumentQueueMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayloadJson = table.Column<string>(type: "text", nullable: false),
                    EnqueuedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    VisibleAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DequeueCount = table.Column<int>(type: "integer", nullable: false),
                    PopReceipt = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentQueueMessages", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentQueueMessages_VisibleAt_EnqueuedAt",
                table: "DocumentQueueMessages",
                columns: new[] { "VisibleAt", "EnqueuedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DocumentQueueMessages");
        }
    }
}
